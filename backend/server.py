from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
import os
import re
import json
import logging
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    ImageContent,
    TextDelta,
    StreamDone,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
LLM_MODEL = "gpt-4o"
LLM_MODEL_FAST = "gpt-4o-mini"  # OpenAI's fast/cheap model
# Fastest option — Google Gemini Flash. ~2x faster than gpt-4o-mini for our JSON
# tasks. Used for user-visible latency-critical paths (Inspire, Ask).
LLM_MODEL_FASTEST = "gemini-2.5-flash"
LLM_PROVIDER_FASTEST = "gemini"
LLM_PROVIDER = "openai"
# Recipe writing (Ask + Inspire): fastest model we benchmarked for full recipe JSON.
RECIPE_PROVIDER = "anthropic"
RECIPE_MODEL = "claude-haiku-4-5-20251001"

# Cache TTL for /inspire (server-side, shared across users) — 30 min
INSPIRE_CACHE_TTL_SECONDS = 4 * 60 * 60  # 4 hours — most users open the app more than once per session
ASK_CACHE_TTL_SECONDS = 6 * 60 * 60
# Bump when the recipe format/prompt changes so cached recipes regenerate.
RECIPE_FORMAT_VERSION = 3
ASK_ANGLES = [
    "the classic, traditional version",
    "a quick weeknight version (ideally under 30 minutes)",
    "a creative twist or lighter, healthier take — clearly different from the classic",
]

# Input size limits (defence in depth against abuse and OOM)
MAX_IMAGE_B64_CHARS = 10_000_000       # ~7.5 MB decoded
MAX_QUERY_CHARS = 500
MAX_INGREDIENTS = 60
MAX_INGREDIENT_LEN = 80

# Rate limiter — respects X-Forwarded-For when behind a reverse proxy
def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anonymous"

limiter = Limiter(key_func=_client_key, default_limits=[])

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api_router = APIRouter(prefix="/api")

# ---------- Models ----------
class ScanRequest(BaseModel):
    image_base64: str  # raw base64 (no data URL prefix expected; we'll strip if present)
    mime_type: Optional[str] = "image/jpeg"


class AnalyzeMealRequest(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"


class AnalyzeMealTextRequest(BaseModel):
    description: str
    servings: Optional[int] = 1


class ScanResponse(BaseModel):
    id: str
    ingredients: List[str]


class SuggestRequest(BaseModel):
    ingredients: List[str]
    max_recipes: int = 5


class AskRecipesRequest(BaseModel):
    query: str
    max_recipes: int = 5
    variant: Optional[int] = None  # 0..2 → one recipe per call with a distinct angle
    idea_id: Optional[str] = None  # from /ask-ideas → write the full recipe for that idea


class AskIdeasRequest(BaseModel):
    query: str


class RecipeIdea(BaseModel):
    id: str
    title: str
    emoji: str = "🍽️"
    description: str = ""
    difficulty: str = "easy"
    time_minutes: int = 30
    image_query: str = ""


class AskIdeasResponse(BaseModel):
    ideas: List[RecipeIdea]


class InspireRequest(BaseModel):
    category: str  # breakfast | lunch | dinner | snack | dessert
    count: int = 8
    refresh: bool = False  # if True, bypass server-side cache


class Nutrition(BaseModel):
    calories: int = 0
    protein_g: int = 0
    fat_g: int = 0
    carbs_g: int = 0


class IngredientDetail(BaseModel):
    name: str
    quantity: str = ""


class CookStep(BaseModel):
    """A single structured cooking step.

    All fields except `instruction` are optional because the LLM may not
    always have a sensible value (e.g. a plating step has no heat/temp).
    """
    number: int
    instruction: str
    ingredients: List[str] = Field(default_factory=list)
    heat: str = ""  # "low" | "medium-low" | "medium" | "medium-high" | "high" | "" (none)
    temperature_c: Optional[int] = None
    duration_minutes: Optional[int] = None
    doneness_cue: str = ""  # optional visual/tactile cue (e.g. "golden brown")


class Recipe(BaseModel):
    id: str
    title: str
    emoji: str
    difficulty: str  # easy / medium / hard
    time_minutes: int
    description: str
    ingredients_used: List[str]
    missing_ingredients: List[str]
    ingredients_detailed: List[IngredientDetail] = Field(default_factory=list)
    instructions: List[str]
    steps: List[CookStep] = Field(default_factory=list)
    nutrition: Nutrition = Field(default_factory=Nutrition)
    servings: int = 1
    yield_text: str = ""
    image_query: str = ""


class SuggestResponse(BaseModel):
    id: str
    recipes: List[Recipe]


class MealAnalysis(BaseModel):
    id: str
    meal_name: str
    description: str
    servings: int
    identified_items: List[str]
    nutrition: "Nutrition"
    confidence: str  # low / medium / high
    notes: str = ""
    is_food: bool = True


# ---------- Helpers ----------
def _validate_image_size(b64: str) -> None:
    if len(b64) > MAX_IMAGE_B64_CHARS:
        raise HTTPException(status_code=413, detail="Image too large")


def _validate_text(text: str, max_chars: int, label: str) -> str:
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    t = text.strip()
    if len(t) > max_chars:
        raise HTTPException(status_code=400, detail=f"{label} too long")
    return t


def _validate_ingredients(items: List[str]) -> List[str]:
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="ingredients must be a list")
    if len(items) > MAX_INGREDIENTS:
        raise HTTPException(status_code=400, detail="Too many ingredients")
    out: List[str] = []
    for it in items:
        if not isinstance(it, str):
            continue
        s = it.strip()
        if not s:
            continue
        if len(s) > MAX_INGREDIENT_LEN:
            raise HTTPException(status_code=400, detail="Ingredient name too long")
        out.append(s)
    return out


def _strip_data_url(b64: str) -> str:
    if b64.startswith("data:"):
        # data:image/jpeg;base64,xxxx
        comma = b64.find(",")
        if comma != -1:
            return b64[comma + 1 :]
    return b64


def _extract_json(text: str):
    """Find first JSON object/array in a string, robustly."""
    text = text.strip()
    # Remove markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Try to find first { ... } or [ ... ] block
    for opener, closer in [("{", "}"), ("[", "]")]:
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end != -1 and end > start:
            chunk = text[start : end + 1]
            try:
                return json.loads(chunk)
            except Exception:
                continue
    raise ValueError("Could not parse JSON from model response")


class LLMBudgetError(HTTPException):
    """Emergent LLM key budget has been exhausted."""

    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            detail=(
                "Our recipe assistant is temporarily unavailable — please try again "
                "in a bit. (If you own this app, top up your Universal Key balance.)"
            ),
        )


async def _run_chat(
    system: str,
    user_msg: UserMessage,
    model: str = LLM_MODEL,
    json_mode: bool = False,
    provider: str = LLM_PROVIDER,
) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message=system,
    ).with_model(provider, model)
    if json_mode and provider == "openai":
        chat = chat.with_params(response_format={"type": "json_object"})
    elif provider == "anthropic":
        chat = chat.with_params(max_tokens=12000)

    buf = []
    try:
        async for ev in chat.stream_message(user_msg):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:
        # Surface budget exhaustion as a distinct 503 so the client can show a
        # helpful message instead of a generic "recipes failed". Any other
        # failure re-raises for the endpoint-level handler.
        msg = str(e).lower()
        if "budget" in msg or "insufficient" in msg or "quota" in msg:
            logging.warning("LLM budget exhausted")
            raise LLMBudgetError()
        raise
    return "".join(buf)


# ---------- Durable per-recipe store ----------
# Every recipe the app ever generates is also stored in MongoDB keyed by its
# UUID. The frontend falls back to GET /api/recipe/{id} when local caches
# miss — so navigating into a recipe (RecipeDetail, Cook Mode) is bullet-
# proof even across sessions, pool refills, or iOS cache eviction.
RECIPE_STORE_TTL_DAYS = 45


async def _ensure_recipe_store_index() -> None:
    try:
        # Primary key index on `id` (unique) + TTL on `last_accessed`.
        await db.recipes_store.create_index("id", unique=True)
        await db.recipes_store.create_index(
            "last_accessed",
            expireAfterSeconds=RECIPE_STORE_TTL_DAYS * 24 * 3600,
        )
    except Exception:
        logging.exception("recipe store index setup failed")


async def _persist_recipes(items: List["Recipe"]) -> None:
    """Bulk upsert the given recipes into the durable `recipes_store`
    collection. Called by every endpoint that returns recipes so a later
    GET /api/recipe/{id} always finds them. Every recipe is re-checked
    against the completeness filter so partial LLM outputs never leak into
    the durable store even if callers forget to filter upfront."""
    if not items:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        ops = []
        for r in items:
            if not getattr(r, "id", None):
                continue
            if not _is_cookable(r):
                continue  # strict completeness is enforced here too
            doc = r.model_dump()
            doc["last_accessed"] = datetime.now(timezone.utc)
            doc["cached_at"] = now_iso
            doc["retired"] = False
            ops.append(
                UpdateOne({"id": r.id}, {"$set": doc}, upsert=True)
            )
        if ops:
            await db.recipes_store.bulk_write(ops, ordered=False)
    except Exception:
        logging.exception("recipe persistence failed")


# ---------- Endpoints ----------
@api_router.get("/")
async def root():
    return {"message": "Manifeast API"}


@api_router.get("/recipe/{recipe_id}", response_model=Recipe)
@limiter.limit("600/hour")
async def get_recipe(request: Request, recipe_id: str):
    """Fetch a single recipe by its stable UUID. Called by the frontend
    when the recipe isn't in any local cache (iOS cold start, long-stale
    link, cache eviction). Refreshes `last_accessed` so hot recipes stay
    alive past the 45-day TTL."""
    if not recipe_id or len(recipe_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid recipe id")
    doc = await db.recipes_store.find_one({"id": recipe_id})
    if not doc or doc.get("retired"):
        raise HTTPException(status_code=404, detail="Recipe not found")
    try:
        # Touch TTL — best-effort, don't block the response if it fails.
        await db.recipes_store.update_one(
            {"id": recipe_id},
            {"$set": {"last_accessed": datetime.now(timezone.utc)}},
        )
    except Exception:
        pass
    doc.pop("_id", None)
    doc.pop("cached_at", None)
    doc.pop("last_accessed", None)
    doc.pop("retired", None)
    recipe = Recipe(**doc)
    # Belt-and-braces: if a stored recipe no longer passes our completeness
    # filter (e.g. it was persisted before the filter was tightened), treat
    # it as missing so the UI shows the proper error instead of a half-recipe.
    if not _is_cookable(recipe):
        logging.info("recipe %s failed cookability on read — treating as 404", recipe_id)
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@api_router.post("/scan", response_model=ScanResponse)
@limiter.limit("30/hour")
async def scan_fridge(request: Request, req: ScanRequest):
    _validate_image_size(req.image_base64)
    b64 = _strip_data_url(req.image_base64)
    if not b64 or len(b64) < 100:
        raise HTTPException(status_code=400, detail="Invalid image data")

    system = (
        "You are a kitchen-vision assistant. You will be shown a photo of a fridge, "
        "pantry, cupboard, or a group of grocery items. Identify every distinct edible "
        "ingredient you can see. Return ONLY a JSON object of the form: "
        '{"ingredients": ["chicken breast", "eggs", "milk", "tomato", "pasta"]}. '
        "Use simple, lowercase, singular common names (e.g., 'egg', 'milk', 'tomato', 'rice'). "
        "Do NOT include packaging, condiments containers without identifiable contents, brand names, "
        "or generic words like 'food'. If you cannot identify any food, return an empty array."
    )

    image = ImageContent(image_base64=b64)
    user_msg = UserMessage(text="Identify all edible ingredients in this image.", file_contents=[image])

    cleaned: List[str] = []
    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        ingredients = data.get("ingredients", []) if isinstance(data, dict) else []
        # normalize
        seen = set()
        for it in ingredients:
            if not isinstance(it, str):
                continue
            name = it.strip().lower()
            if not name or name in seen:
                continue
            seen.add(name)
            cleaned.append(name)
    except HTTPException:
        raise
    except Exception:
        logging.exception("scan failed")
        raise HTTPException(status_code=500, detail="Vision analysis failed")

    scan_id = str(uuid.uuid4())
    # Privacy: we intentionally do NOT persist the user's ingredient list.
    return ScanResponse(id=scan_id, ingredients=cleaned)


def _str_list(values) -> List[str]:
    """Normalise a list-ish value into a clean list of lowercase strings.

    The LLM sometimes returns `ingredients_used` or `missing_ingredients` as
    a single comma/newline-separated string instead of an array. If we just
    iterate that string we would loop character by character and render
    chips like 'r o l l'. Split it first.
    """
    if values is None:
        return []
    if isinstance(values, str):
        parts = re.split(r"[,\n;]+", values)
        return [p.strip().lower() for p in parts if p and p.strip()]
    if not isinstance(values, (list, tuple, set)):
        return []
    out: List[str] = []
    for x in values:
        if isinstance(x, str):
            out.append(x.strip().lower())
        elif isinstance(x, dict):
            name = x.get("name") or x.get("ingredient") or ""
            if isinstance(name, str) and name.strip():
                out.append(name.strip().lower())
    return [s for s in out if s]


_INT_RE = re.compile(r"-?\d+")


def _coerce_int(value, default: int = 0) -> int:
    """Best-effort int coercion. Accepts ints, floats, decimal strings, and
    messy strings like '20 minutes', '2-4', '350 kcal'. Falls back to default
    on failure so an oddly-typed LLM field never drops the whole recipe."""
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except (ValueError, OverflowError):
            return default
    if isinstance(value, str):
        m = _INT_RE.search(value)
        if m:
            try:
                return int(m.group(0))
            except ValueError:
                return default
    return default


def _build_nutrition(raw: dict) -> "Nutrition":
    n = raw if isinstance(raw, dict) else {}
    return Nutrition(
        calories=_coerce_int(n.get("calories"), 0),
        protein_g=_coerce_int(n.get("protein_g"), 0),
        fat_g=_coerce_int(n.get("fat_g"), 0),
        carbs_g=_coerce_int(n.get("carbs_g"), 0),
    )


_LEADING_STEP_RE = re.compile(r"^\s*(?:step\s*)?\d+\s*[\.\):\-]\s*", re.IGNORECASE)

# Shared prompt fragment for how the LLM must write cooking steps. Applied
# to every recipe endpoint (suggest / ask-recipes / inspire) so a recipe
# opened from anywhere in the app has rich, structured Cook Mode steps.
DIRECT_INSTRUCTIONS_RULE = (
    "steps (REQUIRED — an ARRAY of STRUCTURED step objects; USE AS MANY "
    "STEPS AS THE RECIPE ACTUALLY NEEDS: a simple omelette might be 3-4 "
    "steps, a lasagne/biryani/curry should be 8-14 steps — never oversimplify. "
    'Each step object is: {"number": 1, "instruction": "...", '
    '"ingredients": ["300g chicken breast", "1 tbsp olive oil"], '
    '"heat": "medium-high", "temperature_c": 180, "duration_minutes": 6, '
    '"doneness_cue": "golden brown and cooked through"}. '
    "RULES: (a) `instruction` MUST start with an imperative verb (Preheat, "
    "Chop, Heat, Add, Stir, Simmer, Bake, Fold, Whisk, Season, Rest, Serve, "
    "Combine, Drain, Flip, Deglaze, Transfer, Garnish...) and be ONE sentence "
    "of ~10-30 words that references exact quantities from `ingredients_detailed` "
    "— no 'you can', no 'if you like'. (b) `ingredients` lists the exact "
    "measured strings used IN THIS STEP (e.g. '300g chicken breast', "
    "'2 tbsp soy sauce') — pulled verbatim from `ingredients_detailed`. Use "
    "[] for prep/plating steps with no ingredient. (c) `heat` is one of "
    '"low", "medium-low", "medium", "medium-high", "high" when a hob/pan is '
    "involved, else \"\" (empty string). (d) `temperature_c` is the oven/air-"
    "fryer temperature in Celsius when relevant (e.g. 180, 200), else null. "
    "(e) `duration_minutes` is the cook/bake/rest time for this step as an "
    "integer, else null. (f) `doneness_cue` is a short visual/tactile cue "
    '("golden brown", "fragrant", "thickened") or "". (g) TEMPERATURE IS '
    "MANDATORY: every hob/pan/pot step (fry, sauté, sear, simmer, boil, "
    "toast, melt) MUST set `heat` AND say it in the sentence (\"over medium "
    "heat\"); every oven/air-fryer/grill step (bake, roast, grill, preheat) "
    "MUST set `temperature_c` AND say the exact number in the sentence (\"at "
    "200°C\") — never 'hot oven', 'moderate oven' or 'medium oven'; grill "
    "steps give °C (e.g. 230); microwave steps give watts (\"on 800W for 2 "
    "minutes\"); slow-cooker steps give LOW/HIGH plus hours; deep-frying "
    "gives the oil temperature in °C (e.g. 180). "
    "every cooking step MUST set `duration_minutes`. Do NOT return a separate "
    "`instructions` array — `steps` is the single source. NEVER return empty steps), "
)

_HEAT_IN_TEXT_RE = re.compile(r"\b(low|medium[- ]low|medium|medium[- ]high|high)\s+heat\b", re.IGNORECASE)
_TEMP_IN_TEXT_RE = re.compile(r"\b(\d{2,3})\s*°\s*C\b", re.IGNORECASE)
_OVEN_WORDS_RE = re.compile(r"\b(oven|bake|baking|roast|air[- ]?fryer|grill|broil)\b", re.IGNORECASE)
_HOB_WORDS_RE = re.compile(r"\b(fry|frying|sauté|saute|sear|simmer|boil|skillet|wok|saucepan|frying pan)\b", re.IGNORECASE)
_OVEN_STEP_RE = re.compile(r"\b(oven|bake|roast|air[- ]?fryer)\b", re.IGNORECASE)
_HOB_STEP_RE = re.compile(r"\b(fry|fried|sauté|saute|sear|simmer|boil|cook|melt|brown|scramble|flip|toast\w*\s+(?:in|on)\s+(?:the|a)\s+(?:pan|skillet))\b", re.IGNORECASE)
_OFF_HEAT_RE = re.compile(r"\b(remove|take)\s+(?:\w+\s+){0,3}(?:from|off)\s+(?:the\s+)?(heat|oven|pan)\b|\b(cool|rest|serve|garnish|chill)\b", re.IGNORECASE)
_TO_TASTE_RE = re.compile(r"\b(salt|black pepper|white pepper|pepper to taste|salt and pepper)\b|^pepper$", re.IGNORECASE)


_VALID_HEATS = {"low", "medium-low", "medium", "medium-high", "high"}
_HEAT_ALIASES = {
    "med": "medium",
    "med-low": "medium-low",
    "med-high": "medium-high",
    "medlow": "medium-low",
    "medhigh": "medium-high",
    "lo": "low",
    "hi": "high",
}


def _normalise_heat(raw) -> str:
    if not isinstance(raw, str):
        return ""
    v = raw.strip().lower()
    # Strip trailing "heat"/"flame" so "medium heat" / "high flame" work too.
    for suffix in (" heat", " flame", " fire"):
        if v.endswith(suffix):
            v = v[: -len(suffix)].rstrip()
    v = v.replace(" ", "-")
    v = _HEAT_ALIASES.get(v, v)
    return v if v in _VALID_HEATS else ""


def _coerce_opt_int(value) -> Optional[int]:
    if value is None or value == "" or value is False:
        return None
    n = _coerce_int(value, default=-10**9)
    return n if n != -10**9 else None


def _build_steps(raw_steps, fallback_instructions, ingredients_detailed) -> List[CookStep]:
    """Parse the LLM's `steps` array into CookStep objects. If the LLM only
    returned plain `instructions`, synthesise minimal structured steps so the
    app always has `steps` to render. `ingredients_detailed` is used as the
    pool for heuristically backfilling an `ingredients` list when the LLM
    omits it.
    """
    out: List[CookStep] = []
    ing_names = [
        (ing.name or "").lower() for ing in (ingredients_detailed or []) if ing.name
    ]
    ing_quantities = {
        (ing.name or "").lower(): (ing.quantity or "") for ing in (ingredients_detailed or [])
    }

    # Common measurement units we want to treat as "just a quantity, not an
    # ingredient name" when deciding whether an LLM entry needs enriching.
    UNIT_WORDS = {
        "tsp", "tbsp", "cup", "cups", "ml", "l", "g", "kg", "oz", "lb",
        "pinch", "dash", "clove", "cloves", "slice", "slices", "piece",
        "pieces", "stick", "sticks", "can", "cans", "handful", "sprig",
        "sprigs", "bunch",
    }

    def _looks_like_only_quantity(entry: str) -> bool:
        # True if the entry has zero "real" ingredient-name words — i.e. it's
        # just numbers + fraction symbols + unit words (e.g. "2", "1/2 cup",
        # "1 tsp"). We'll enrich these with the matching name from the detailed list.
        tokens = re.findall(r"[a-zA-Z]+", entry.lower())
        real_words = [t for t in tokens if t not in UNIT_WORDS]
        return len(real_words) == 0

    def _enrich_against_step_text(entry: str, step_text: str) -> str:
        # Find an ingredient name from `ingredients_detailed` that appears in
        # this step and glue the entry's quantity in front of it.
        hay = f" {step_text.lower()} "
        for name in ing_names:
            key = name.split()[-1] if name else ""
            if not key or len(key) < 3:
                continue
            if f" {key} " in hay or f" {key}s " in hay or f" {key}es " in hay:
                return f"{entry} {name}".strip()
        return entry

    def _add_quantity_by_name(entry: str) -> str:
        # "zucchini" → "2 medium zucchini" using the recipe's measured list.
        if re.search(r"\d", entry) or "to taste" in entry.lower():
            return entry
        e = entry.lower().strip()
        best = None
        for name in ing_names:
            if name == e:
                best = name
                break
            if best is None and (e in name or name in e):
                best = name
        qty = ing_quantities.get(best, "").strip() if best else ""
        return f"{qty} {best}".strip() if qty else entry

    def _step_ingredients_for(text: str, llm_list) -> List[str]:
        if isinstance(llm_list, list) and llm_list:
            out: List[str] = []
            seen = set()
            for x in llm_list:
                if isinstance(x, dict):
                    x = f"{x.get('quantity', '') or ''} {x.get('name', '') or ''}"
                if not isinstance(x, (str, int, float)):
                    continue
                entry = str(x).strip()
                if not entry:
                    continue
                # Enrich bare-quantity entries with the matching name from
                # the full ingredient list — e.g. "2" → "2 eggs".
                if _looks_like_only_quantity(entry):
                    entry = _enrich_against_step_text(entry, text)
                else:
                    entry = _add_quantity_by_name(entry)
                key = entry.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(entry)
            return out
        # Heuristic fallback: find any ingredient name appearing in the step
        # text and emit "quantity name" (e.g. "2 tbsp olive oil").
        t = f" {text.lower()} "
        matched = []
        for name in ing_names:
            key = name.split()[-1] if name else ""
            if not key or len(key) < 3:
                continue
            if f" {key} " in t or f" {key}s " in t or f" {key}es " in t:
                qty = ing_quantities.get(name, "").strip()
                matched.append(f"{qty} {name}".strip())
        return matched

    if isinstance(raw_steps, list) and raw_steps:
        for i, s in enumerate(raw_steps, 1):
            if not isinstance(s, dict):
                # Allow plain strings in the steps array as a lax fallback.
                text = _LEADING_STEP_RE.sub("", str(s or "")).strip()
                if not text:
                    continue
                out.append(CookStep(
                    number=i,
                    instruction=text,
                    ingredients=_step_ingredients_for(text, None),
                ))
                continue
            instr = (
                s.get("instruction")
                or s.get("text")
                or s.get("step")
                or s.get("description")
                or ""
            )
            if not isinstance(instr, str):
                instr = str(instr or "")
            instr = _LEADING_STEP_RE.sub("", instr).strip()
            if not instr:
                continue
            heat = _normalise_heat(s.get("heat"))
            if not heat:
                m = _HEAT_IN_TEXT_RE.search(instr)
                heat = _normalise_heat(m.group(1)) if m else ""
            temp_c = _coerce_opt_int(s.get("temperature_c") or s.get("temperature"))
            if not temp_c:
                m = _TEMP_IN_TEXT_RE.search(instr)
                temp_c = int(m.group(1)) if m else None
            out.append(CookStep(
                number=_coerce_int(s.get("number"), i),
                instruction=instr,
                ingredients=_step_ingredients_for(instr, s.get("ingredients")),
                heat=heat,
                temperature_c=temp_c,
                duration_minutes=_coerce_opt_int(s.get("duration_minutes") or s.get("duration") or s.get("time_minutes")),
                doneness_cue=str(s.get("doneness_cue") or s.get("cue") or "").strip(),
            ))
    # Fallback path: no structured steps — build them from the string
    # instructions so Cook Mode still has `steps` to render.
    if not out and isinstance(fallback_instructions, list):
        for i, text in enumerate(fallback_instructions, 1):
            if not isinstance(text, str) or not text.strip():
                continue
            out.append(CookStep(
                number=i,
                instruction=text.strip(),
                ingredients=_step_ingredients_for(text, None),
            ))
    # Every cooking step should say how hot: read it from the sentence, else
    # carry forward the pan heat / oven temperature set earlier in the recipe.
    last_heat, last_temp = "", None
    for s in out:
        if not s.heat:
            m = _HEAT_IN_TEXT_RE.search(s.instruction)
            if m:
                s.heat = _normalise_heat(m.group(1))
        if not s.temperature_c:
            m = _TEMP_IN_TEXT_RE.search(s.instruction)
            if m:
                s.temperature_c = int(m.group(1))
        removing = _OFF_HEAT_RE.search(s.instruction)
        if not s.temperature_c and last_temp and _OVEN_STEP_RE.search(s.instruction) and not removing:
            s.temperature_c = last_temp
        if not s.heat and not s.temperature_c and not removing and _HOB_STEP_RE.search(s.instruction):
            s.heat = "high" if re.search(r"\b(boil|bring to the boil)", s.instruction, re.IGNORECASE) else last_heat
        last_heat = s.heat or last_heat
        last_temp = s.temperature_c or last_temp
    # Renumber defensively — LLMs sometimes return 1,1,2 or 1,3,4.
    for i, s in enumerate(out, 1):
        s.number = i
    return out


def _is_cookable(recipe: "Recipe") -> bool:
    """Strict completeness guard — Inspire (and other recipe endpoints) only
    surface recipes that a user can open and cook from start to finish with
    zero guessing. A recipe is rejected if any of these are missing:

    * title
    * time_minutes > 0  (total cook time)
    * servings > 0
    * at least 3 ingredients in ``ingredients_detailed`` AND every one of
      them carries a non-empty ``quantity`` (so "chicken" alone is out —
      "300g chicken breast" is in)
    * at least 3 cooking steps (either structured ``steps`` or legacy
      ``instructions`` strings) with non-empty text
    * at least one step with concrete cooking metadata — a heat level,
      a temperature, or a duration — otherwise the recipe is probably
      a one-liner summary, not real cooking directions.

    Cold / no-cook recipes still pass as long as they have proper step
    text (they'll just not need heat/temp — we accept ``duration_minutes``
    as the concrete metadata for things like "chill for 30 min").
    """
    if recipe is None:
        return False
    if not recipe.title or not recipe.title.strip():
        return False
    if not isinstance(recipe.time_minutes, int) or recipe.time_minutes <= 0:
        return False
    if not isinstance(recipe.servings, int) or recipe.servings <= 0:
        return False

    # Ingredients must be fully measured.
    ings = recipe.ingredients_detailed or []
    if len(ings) < 3:
        return False
    for ing in ings:
        name = (ing.name or "").strip()
        qty = (ing.quantity or "").strip()
        if not name or not qty:
            return False

    # Steps must exist and be non-trivial.
    steps = recipe.steps or []
    instructions = recipe.instructions or []
    step_count = max(len(steps), len(instructions))
    if step_count < 3:
        return False
    if steps:
        if sum(1 for s in steps if (s.instruction or "").strip()) < 3:
            return False
        # Require at least one step carries real cooking metadata so we
        # aren't shipping vague "cook until done" one-liners.
        if not any(
            (s.heat or "") or (s.temperature_c and s.temperature_c > 0) or (s.duration_minutes and s.duration_minutes > 0)
            for s in steps
        ):
            return False
        # Users must always know how hot to cook: oven recipes need a °C,
        # hob recipes need a heat level.
        text = " ".join(s.instruction for s in steps)
        if _OVEN_WORDS_RE.search(text) and not any(s.temperature_c for s in steps):
            return False
        if _HOB_WORDS_RE.search(text) and not any(s.heat for s in steps):
            return False
    elif instructions:
        if sum(1 for t in instructions if isinstance(t, str) and t.strip()) < 3:
            return False
        # Legacy strings — require at least one to mention a concrete time
        # or temperature (e.g. "20 minutes", "180°C").
        meta_re = re.compile(r"(\d+\s*(?:°\s*c|degrees|min|minute|hour|hr|sec))", re.IGNORECASE)
        if not any(meta_re.search(t) for t in instructions if isinstance(t, str)):
            return False
    return True


def _build_instructions(raw) -> List[str]:
    """Normalize an ``instructions`` value from the LLM into a clean list of
    strings. The model sometimes emits objects like ``{"step": "..."}`` or
    prefixes each step with ``1.``/``Step 1:`` — we accept both and strip
    the leading numbering so CookMode's own ``Step 01`` label doesn't double up.
    """
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw:
        text = ""
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            for key in ("step", "text", "instruction", "description", "content"):
                v = item.get(key)
                if isinstance(v, str) and v.strip():
                    text = v
                    break
            if not text:
                # Fallback: join any string values in the dict
                text = " ".join(str(v) for v in item.values() if isinstance(v, (str, int, float)))
        elif item is not None:
            text = str(item)
        text = _LEADING_STEP_RE.sub("", text or "").strip()
        if text:
            out.append(text)
    return out


def _build_ingredients_detailed(raw) -> List["IngredientDetail"]:
    out: List[IngredientDetail] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            qty = str(item.get("quantity", "") or "").strip()
            if not qty and _TO_TASTE_RE.search(name):
                qty = "to taste"
            if name:
                out.append(IngredientDetail(name=name.lower(), quantity=qty))
        elif isinstance(item, str):
            s = item.strip()
            if s:
                out.append(IngredientDetail(name=s.lower(), quantity=""))
    return out


def _build_recipe(r: dict) -> Optional["Recipe"]:
    if not isinstance(r, dict):
        return None
    try:
        title = str(r.get("title", "")).strip()
        if not title:
            return None
        ingredients_detailed = _build_ingredients_detailed(r.get("ingredients_detailed"))
        instructions = _build_instructions(r.get("instructions"))
        steps = _build_steps(r.get("steps"), instructions, ingredients_detailed)
        # Keep `instructions` consistent with `steps` so legacy UI paths and
        # older clients still render something sensible.
        if not instructions and steps:
            instructions = [s.instruction for s in steps]
        return Recipe(
            id=str(uuid.uuid4()),
            title=title,
            emoji=str(r.get("emoji", "🍽️")).strip() or "🍽️",
            difficulty=str(r.get("difficulty", "easy")).strip().lower(),
            time_minutes=max(1, _coerce_int(r.get("time_minutes"), 15)),
            description=str(r.get("description", "")).strip(),
            ingredients_used=_str_list(r.get("ingredients_used")),
            missing_ingredients=_str_list(r.get("missing_ingredients")),
            ingredients_detailed=ingredients_detailed,
            instructions=instructions,
            steps=steps,
            servings=max(1, _coerce_int(r.get("servings"), 1)),
            yield_text=str(r.get("yield_text", "")).strip(),
            nutrition=_build_nutrition(r.get("nutrition")),
            image_query=str(r.get("image_query", "")).strip().lower(),
        )
    except Exception:
        logging.exception("_build_recipe failed for payload=%s", r)
        return None


@api_router.post("/suggest", response_model=SuggestResponse)
@limiter.limit("60/hour")
async def suggest_recipes(request: Request, req: SuggestRequest):
    cleaned_in = _validate_ingredients(req.ingredients)
    if not cleaned_in:
        raise HTTPException(status_code=400, detail="ingredients list is required")

    ingredient_list = ", ".join(cleaned_in)
    n = max(3, min(req.max_recipes, 5))

    system = (
        "You are a friendly home-cook recipe assistant. Given a list of ingredients the user has, "
        f"suggest {n} realistic meal ideas that prioritize using ONLY the items they have. "
        "It's fine if a recipe needs 1–3 small extra items (oil, salt, pepper, herbs, garlic, butter "
        "are considered pantry staples and should NOT be listed as missing). For each recipe, return: "
        "title (short, appetizing), emoji (single food emoji), difficulty ('easy' or 'medium'), "
        "time_minutes (integer total time), description (1 short sentence), ingredients_used (list of "
        "lowercase strings from the user's list that are used), missing_ingredients (list of lowercase "
        "items the user does NOT have), "
        "ingredients_detailed (REQUIRED — a complete ingredient list for the whole recipe as an array of "
        'objects like {"name": "chicken breast", "quantity": "2 (about 400g)"} or '
        '{"name": "olive oil", "quantity": "2 tbsp"}. Include EVERY ingredient needed with realistic measured '
        "quantities — cups/tbsp/tsp/g/ml/whole units, whichever fits. Do not omit staples like salt/pepper/oil), "
        + DIRECT_INSTRUCTIONS_RULE +
        "servings (integer, default 2), "
        'yield_text (REQUIRED short human-readable yield/output, e.g. "Serves 4", "Makes 12 muffins", '
        '"1 loaf (10 slices)", "About 4 cups"), '
        "and nutrition (object with calories, protein_g, fat_g, carbs_g as integers — estimate PER SERVING "
        "based on the quantities above; be realistic, not zero), "
        "and image_query (2-4 comma-separated lowercase keywords describing what the finished dish "
        "would look like in a food photo, e.g. 'creamy chicken pasta, close up' or 'fried rice, bowl'). "
        'Return ONLY JSON of the form: {"recipes": [ {...}, {...} ]}'
    )

    user_text = (
        f"My ingredients: {ingredient_list}.\n"
        f"Give me {n} meal ideas. Favor ones with the fewest missing items."
    )
    user_msg = UserMessage(text=user_text)

    async def _fetch_once() -> List[Recipe]:
        built_recipes: List[Recipe] = []
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        for r in raw_recipes:
            built = _build_recipe(r)
            if _is_cookable(built):
                built_recipes.append(built)
        return built_recipes

    recipes: List[Recipe] = []
    try:
        recipes = await _fetch_once()
        if not recipes:
            logging.warning("suggest: empty after parse, retrying once")
            recipes = await _fetch_once()
    except HTTPException:
        raise
    except Exception:
        logging.exception("suggest failed")
        raise HTTPException(status_code=500, detail="Recipe suggestion failed")

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    suggestion_id = str(uuid.uuid4())
    # Privacy: user ingredients / queries are not persisted.
    await _persist_recipes(recipes)
    return SuggestResponse(id=suggestion_id, recipes=recipes)


_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]")


@api_router.post("/ask-ideas", response_model=AskIdeasResponse)
@limiter.limit("120/hour")
async def ask_ideas(request: Request, req: AskIdeasRequest):
    """Fast first phase of Ask: 3 short recipe ideas (title, photo keywords,
    time) in ~2-3s so cards appear instantly. Each full recipe is then written
    via /ask-recipes {idea_id} and the card only opens once it's complete."""
    q = _validate_text(req.query or "", MAX_QUERY_CHARS, "query")
    if not q:
        raise HTTPException(status_code=400, detail="query is required")
    cache_key = f"ideas::{q.lower().strip()}"
    now = datetime.now(timezone.utc)
    cached = await db.ask_cache.find_one({"key": cache_key})
    if cached and cached.get("ideas"):
        if (now - datetime.fromisoformat(cached["created_at"])).total_seconds() < ASK_CACHE_TTL_SECONDS:
            return AskIdeasResponse(ideas=[RecipeIdea(**i) for i in cached["ideas"]])

    angles = "; ".join(f"{i + 1}) {a}" for i, a in enumerate(ASK_ANGLES))
    system = (
        "You are a recipe assistant. The user names a dish, cuisine or craving. "
        f"Suggest exactly {len(ASK_ANGLES)} clearly different, real, cookable recipes in this order: {angles}. "
        "Each title must be unique and reflect its angle. For each return: title, emoji (one food emoji), "
        "description (max 15 words), difficulty ('easy'|'medium'|'hard'), time_minutes (int total), "
        "image_query (2-4 lowercase keywords for a food photo of the finished dish). "
        'Return ONLY JSON: {"ideas": [ {...} ]}'
    )
    try:
        raw = await _run_chat(system, UserMessage(text=q), model=RECIPE_MODEL, json_mode=True, provider=RECIPE_PROVIDER)
        data = _extract_json(raw)
    except HTTPException:
        raise
    except Exception:
        logging.exception("ask-ideas failed")
        raise HTTPException(status_code=500, detail="Recipe search failed")

    ideas: List[RecipeIdea] = []
    seen = set()
    for it in (data.get("ideas", []) if isinstance(data, dict) else [])[: len(ASK_ANGLES)]:
        if not isinstance(it, dict):
            continue
        title = _EMOJI_RE.sub("", str(it.get("title", ""))).strip()
        if not title or title.lower() in seen:
            continue
        seen.add(title.lower())
        ideas.append(RecipeIdea(
            id=str(uuid.uuid4()),
            title=title,
            emoji=str(it.get("emoji", "🍽️")).strip() or "🍽️",
            description=str(it.get("description", "")).strip(),
            difficulty=str(it.get("difficulty", "easy")).strip().lower(),
            time_minutes=max(1, _coerce_int(it.get("time_minutes"), 30)),
            image_query=str(it.get("image_query", "")).strip().lower(),
        ))
    if not ideas:
        raise HTTPException(status_code=500, detail="No recipes returned")
    await db.ask_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "ideas": [i.model_dump() for i in ideas], "created_at": now.isoformat()}},
        upsert=True,
    )
    return AskIdeasResponse(ideas=ideas)


@api_router.post("/ask-recipes", response_model=SuggestResponse)
@limiter.limit("180/hour")
async def ask_recipes(request: Request, req: AskRecipesRequest):
    q = _validate_text(req.query or "", MAX_QUERY_CHARS, "query")
    if not q:
        raise HTTPException(status_code=400, detail="query is required")
    variant = req.variant if req.variant is not None and 0 <= req.variant < len(ASK_ANGLES) else None
    idea = None
    if req.idea_id:
        doc = await db.ask_cache.find_one({"ideas.id": req.idea_id}, {"ideas.$": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Recipe idea not found — please search again")
        idea = RecipeIdea(**doc["ideas"][0])
    n = 1 if (variant is not None or idea) else max(1, min(req.max_recipes, 5))
    if idea:
        angle = (
            f'Write the complete recipe for "{idea.title}" — {idea.description} '
            f"Keep exactly that title. "
        )
    elif variant is not None:
        angle = f"Make it {ASK_ANGLES[variant]}, and make the title clearly reflect that angle. "
    else:
        angle = f"Return {n} DIFFERENT variations (classic + twists). "

    # ---- Short-lived cache (shared across all users, 6h TTL) ----
    cache_key = f"idea::{idea.id}" if idea else f"{q.lower().strip()}::{n}::{variant}"
    now = datetime.now(timezone.utc)
    try:
        cached = await db.ask_cache.find_one({"key": cache_key, "format": RECIPE_FORMAT_VERSION})
        if cached and cached.get("recipes"):
            created = datetime.fromisoformat(cached["created_at"])
            if (now - created).total_seconds() < ASK_CACHE_TTL_SECONDS:
                cached_recipes = [
                    rec for rec in (Recipe(**r) for r in cached["recipes"]) if _is_cookable(rec)
                ][:n]
                if cached_recipes:
                    logging.info("ask cache HIT for %r", cache_key)
                    await _persist_recipes(cached_recipes)
                    return SuggestResponse(id=cached["id"], recipes=cached_recipes)
    except Exception:
        logging.exception("ask cache read failed")

    # The frontend fires one call per variant in parallel and renders each
    # recipe the moment it lands (~10s) instead of waiting ~30s for all three.
    system = (
        "You are a friendly recipe assistant. The user will tell you a dish, cuisine, "
        f"or craving. {angle}"
        "For each recipe return this JSON schema: "
        "title, emoji, difficulty ('easy'|'medium'|'hard'), time_minutes (int), description "
        "(one sentence), ingredients_used (list of lowercase names), missing_ingredients (empty), "
        "ingredients_detailed (REQUIRED — array of {name, quantity} objects covering every ingredient "
        "with measured quantities, do not omit staples), "
        + DIRECT_INSTRUCTIONS_RULE +
        "servings (int, default 2), yield_text (REQUIRED short human-readable yield), "
        "nutrition {calories, protein_g, fat_g, carbs_g} per serving as realistic ints, "
        "image_query (2-4 keywords for a food photo). "
        'Return ONLY JSON: {"recipes": [ {...} ]}'
    )

    user_msg = UserMessage(
        text=f'Give me the full recipe for "{idea.title}"' if idea
        else f"Give me a recipe for: {q}" if variant is not None
        else f"Give me {n} different variations for: {q}"
    )

    async def _fetch_once() -> List[Recipe]:
        built: List[Recipe] = []
        raw = await _run_chat(system, user_msg, model=RECIPE_MODEL, json_mode=True, provider=RECIPE_PROVIDER)
        data = _extract_json(raw)
        for r in data.get("recipes", []) if isinstance(data, dict) else []:
            rec = _build_recipe(r)
            if _is_cookable(rec):
                if idea:
                    # Same id/title/photo as the card the user is already looking at.
                    rec.id = idea.id
                    rec.title = idea.title
                    rec.emoji = idea.emoji
                    rec.image_query = idea.image_query or rec.image_query
                    rec.description = idea.description or rec.description
                built.append(rec)
        return built

    recipes: List[Recipe] = []
    try:
        recipes = await _fetch_once()
        if not recipes:
            logging.warning("ask-recipes: empty after parse, retrying once")
            recipes = await _fetch_once()
    except HTTPException:
        raise
    except Exception:
        logging.exception("ask-recipes failed")
        raise HTTPException(status_code=500, detail="Recipe search failed")

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    recipes = recipes[:n]

    suggestion_id = str(uuid.uuid4())
    await db.suggestions.insert_one(
        {
            "id": suggestion_id,
            "query": q,
            "recipes": [r.model_dump() for r in recipes],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    # Store in the ask cache so repeat queries are instant.
    try:
        await db.ask_cache.update_one(
            {"key": cache_key},
            {"$set": {
                "key": cache_key,
                "id": suggestion_id,
                "recipes": [r.model_dump() for r in recipes],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "format": RECIPE_FORMAT_VERSION,
            }},
            upsert=True,
        )
    except Exception:
        logging.exception("ask cache write failed")
    await _persist_recipes(recipes)
    return SuggestResponse(id=suggestion_id, recipes=recipes)


@api_router.post("/inspire", response_model=SuggestResponse)
@limiter.limit("150/hour")
async def inspire_meals(request: Request, req: InspireRequest):
    category = (req.category or "").strip().lower()
    allowed = {"breakfast", "lunch", "dinner", "snack", "dessert"}
    if category not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of {sorted(allowed)}",
        )
    n = max(3, min(req.count, 12))
    force_refresh = bool(getattr(req, "refresh", False))

    # ---- Server-side cache (shared across all users, 30 min TTL) ----
    now = datetime.now(timezone.utc)
    if not force_refresh:
        cached = await db.inspire_cache.find_one({"category": category, "format": RECIPE_FORMAT_VERSION})
        if cached:
            try:
                created = datetime.fromisoformat(cached["created_at"])
                age = (now - created).total_seconds()
                if age < INSPIRE_CACHE_TTL_SECONDS and cached.get("recipes"):
                    cached_recipes = [
                        rec for rec in (Recipe(**r) for r in cached["recipes"]) if _is_cookable(rec)
                    ][:n]
                    if len(cached_recipes) >= 3:
                        logging.info("inspire cache HIT %s (age=%ss)", category, int(age))
                        await _persist_recipes(cached_recipes)
                        return SuggestResponse(id=cached["id"], recipes=cached_recipes)
                    logging.info("inspire cache for %s had too few cookable recipes — refetching", category)
            except Exception:
                logging.exception("inspire cache read failed — refetching")

    # ---- Cache miss: call the fast model in PARALLEL batches ----
    # Rationale: asking gpt-4o-mini for 12 structured step objects in a single
    # call takes >60s and the K8s ingress kills it. 4 parallel calls of 4
    # recipes each come back in ~15-20s AND let us OVER-FETCH so the strict
    # cookability filter (ingredients must all have quantities, >=3 steps
    # with real cooking metadata, etc.) can discard mediocre recipes and
    # still leave us with >= n keepers.
    BATCH_SIZE = 3
    # Over-fetch by ~60% so we have headroom after the strict filter rejects
    # under-specified recipes.
    target_fetch = max(n + 4, int(n * 1.6))
    num_batches = max(1, (target_fetch + BATCH_SIZE - 1) // BATCH_SIZE)
    batch_sizes = [BATCH_SIZE] * num_batches

    # Slight per-batch "angle" hint keeps the three calls from converging on
    # the same recipes.
    BATCH_ANGLES = [
        "classic home-cooked comfort food",
        "healthy, lighter, veggie-forward",
        "global / international flavours",
    ]

    def _build_system(batch_n: int, angle: str) -> str:
        return (
            f"You are a creative recipe curator. Suggest {batch_n} DIFFERENT and varied "
            f"{category} ideas, leaning towards {angle}. Mix cuisines, flavor profiles, "
            "and difficulty. Avoid near-duplicates. Keep descriptions SHORT (max ~15 words). "
            "For each recipe return this JSON schema: "
            "title, emoji, difficulty ('easy'|'medium'|'hard'), time_minutes (int), "
            "description (one short appetizing sentence), "
            "ingredients_used (the full ingredient list, lowercase names only), "
            "missing_ingredients (empty array), "
            "ingredients_detailed (REQUIRED — array of objects like "
            '{"name": "rolled oats", "quantity": "1/2 cup (50g)"} covering every ingredient '
            "with realistic measured amounts), "
            + DIRECT_INSTRUCTIONS_RULE +
            "servings (int, default 2), "
            'yield_text (REQUIRED short human-readable output like "Serves 2", '
            '"Makes 12 pancakes", "1 bowl"), '
            "nutrition object (calories, protein_g, fat_g, carbs_g per serving as integers, realistic), and "
            "image_query (2-4 lowercase comma-separated keywords for a food photo). "
            'Return ONLY JSON: {"recipes": [ {...}, {...} ]}'
        )

    async def _fetch_batch(batch_n: int, angle: str) -> List[Recipe]:
        built_recipes: List[Recipe] = []
        try:
            system = _build_system(batch_n, angle)
            user_msg = UserMessage(
                text=f"Give me {batch_n} varied {category} ideas I could make today."
            )
            raw = await _run_chat(system, user_msg, model=RECIPE_MODEL, json_mode=True, provider=RECIPE_PROVIDER)
            data = _extract_json(raw)
            raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
            for r in raw_recipes:
                built = _build_recipe(r)
                if _is_cookable(built):
                    built_recipes.append(built)
        except Exception:
            # One batch failing shouldn't take down the whole category — the
            # others will still populate. Log and move on.
            logging.exception("inspire batch failed (category=%s, batch_n=%s)", category, batch_n)
        return built_recipes

    async def _fetch_once() -> List[Recipe]:
        results = await asyncio.gather(*[
            _fetch_batch(sz, BATCH_ANGLES[i % len(BATCH_ANGLES)])
            for i, sz in enumerate(batch_sizes)
        ])
        merged: List[Recipe] = []
        seen_titles = set()
        for batch in results:
            for r in batch:
                key = (r.title or "").strip().lower()
                if key and key not in seen_titles:
                    seen_titles.add(key)
                    merged.append(r)
        return merged

    recipes: List[Recipe] = []
    seen_titles: set[str] = set()

    # Single over-fetched sweep — the +60% headroom means we almost always
    # pass the strict completeness filter on the first attempt. One retry
    # only if we end up with literally zero recipes.
    try:
        fresh = await _fetch_once()
        for r in fresh:
            key = (r.title or "").strip().lower()
            if key and key not in seen_titles:
                seen_titles.add(key)
                recipes.append(r)
        if not recipes:
            logging.warning("inspire %s: zero cookable recipes, one retry", category)
            fresh = await _fetch_once()
            for r in fresh:
                key = (r.title or "").strip().lower()
                if key and key not in seen_titles:
                    seen_titles.add(key)
                    recipes.append(r)
    except HTTPException:
        raise
    except Exception:
        logging.exception("inspire failed")
        raise HTTPException(status_code=500, detail="Inspiration failed")

    # Trim to the requested count — we never over-return.
    recipes = recipes[:n]

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    suggestion_id = str(uuid.uuid4())

    # Write-through cache (upsert per category)
    try:
        await db.inspire_cache.update_one(
            {"category": category},
            {
                "$set": {
                    "id": suggestion_id,
                    "category": category,
                    "recipes": [r.model_dump() for r in recipes],
                    "created_at": now.isoformat(),
                    "format": RECIPE_FORMAT_VERSION,
                }
            },
            upsert=True,
        )
    except Exception:
        logging.exception("inspire cache write failed — returning uncached result")

    await _persist_recipes(recipes)
    return SuggestResponse(id=suggestion_id, recipes=recipes)


@api_router.post("/analyze-meal", response_model=MealAnalysis)
@limiter.limit("30/hour")
async def analyze_meal(request: Request, req: AnalyzeMealRequest):
    _validate_image_size(req.image_base64)
    b64 = _strip_data_url(req.image_base64)
    if not b64 or len(b64) < 100:
        raise HTTPException(status_code=400, detail="Invalid image data")

    system = (
        "You are a nutrition-estimation assistant. Given a photograph of a plated / prepared meal "
        "(or a snack, drink, or any food item), identify what it is and estimate its nutrition. "
        "Be realistic and honest about uncertainty — food photos are notoriously hard to size. "
        "Return ONLY a JSON object with these exact fields: "
        "is_food (boolean — false if the image doesn't contain food/drink), "
        "meal_name (short, e.g. 'Grilled salmon with asparagus'; 'Not a meal' if is_food is false), "
        "description (one short sentence describing the dish), "
        "servings (integer, typically 1 for a single plate), "
        "identified_items (list of visible food components, lowercase), "
        "nutrition (object with calories, protein_g, fat_g, carbs_g — all integers, PER SERVING; "
        "all zero if is_food is false), "
        "confidence ('low', 'medium', or 'high' based on how confidently you can identify + size the meal), "
        "notes (brief caveats like 'assumed ~200g portion' or 'dressing not visible'; empty string if none). "
        "If confidence is low because the portion is ambiguous, prefer an estimate that leans slightly conservative."
    )

    image = ImageContent(image_base64=b64)
    user_msg = UserMessage(text="Analyze this meal's nutrition.", file_contents=[image])

    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        if not isinstance(data, dict):
            raise ValueError("Model did not return a JSON object")
        analysis = MealAnalysis(
            id=str(uuid.uuid4()),
            meal_name=str(data.get("meal_name", "Unknown")).strip() or "Unknown",
            description=str(data.get("description", "")).strip(),
            servings=int(data.get("servings", 1) or 1),
            identified_items=_str_list(data.get("identified_items")),
            nutrition=_build_nutrition(data.get("nutrition")),
            confidence=str(data.get("confidence", "medium")).strip().lower(),
            notes=str(data.get("notes", "")).strip(),
            is_food=bool(data.get("is_food", True)),
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("analyze-meal failed")
        raise HTTPException(status_code=500, detail="Meal analysis failed")

    await db.meal_analyses.insert_one(
        {
            "id": analysis.id,
            "meal_name": analysis.meal_name,
            "nutrition": analysis.nutrition.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return analysis


@api_router.post("/analyze-meal-text", response_model=MealAnalysis)
@limiter.limit("30/hour")
async def analyze_meal_text(request: Request, req: AnalyzeMealTextRequest):
    text = (req.description or "").strip()
    if len(text) < 3:
        raise HTTPException(status_code=400, detail="Please describe what you ate")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="Description too long (max 500 chars)")
    servings = max(1, min(20, int(req.servings or 1)))

    system = (
        "You are a nutrition-estimation assistant. The user will describe a meal, snack, or drink "
        "in plain text (e.g. 'chicken caesar wrap with fries', 'two slices of pepperoni pizza', "
        "'coffee with milk and sugar'). Estimate its nutrition realistically. "
        "Return ONLY a JSON object with these exact fields: "
        "is_food (boolean — false if the input is not food/drink), "
        "meal_name (short, e.g. 'Chicken Caesar Wrap with Fries'), "
        "description (one short sentence describing the dish), "
        "servings (integer — use the count the user described or 1 by default), "
        "identified_items (list of components, lowercase), "
        "nutrition (object with calories, protein_g, fat_g, carbs_g — all integers, PER SERVING; "
        "zeros if is_food is false), "
        "confidence ('low', 'medium', or 'high'), "
        "notes (brief caveats about portion assumptions; empty string if none)."
    )

    user_text = (
        f"Meal description: {text}\n"
        f"Servings the user specified: {servings}\n"
        "Analyze this meal's nutrition."
    )
    user_msg = UserMessage(text=user_text)

    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        if not isinstance(data, dict):
            raise ValueError("Model did not return a JSON object")
        analysis = MealAnalysis(
            id=str(uuid.uuid4()),
            meal_name=str(data.get("meal_name", "Unknown")).strip() or "Unknown",
            description=str(data.get("description", "")).strip(),
            servings=int(data.get("servings", servings) or servings),
            identified_items=_str_list(data.get("identified_items")),
            nutrition=_build_nutrition(data.get("nutrition")),
            confidence=str(data.get("confidence", "medium")).strip().lower(),
            notes=str(data.get("notes", "")).strip(),
            is_food=bool(data.get("is_food", True)),
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("analyze-meal-text failed")
        raise HTTPException(status_code=500, detail="Meal analysis failed")

    await db.meal_analyses.insert_one(
        {
            "id": analysis.id,
            "meal_name": analysis.meal_name,
            "nutrition": analysis.nutrition.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return analysis


# ---------- App Store icon generator (AI-powered, temporary utility) ----------
import base64 as _b64
from fastapi.responses import Response as _FastAPIResponse
from PIL import Image as _PILImage
import io as _io

_ICON_PROMPTS = {
    "warm": (
        "A minimalist, modern iOS app icon 1024x1024 pixels, square, no rounded corners, "
        "no text, no letters. A cozy stylized refrigerator open with fresh vegetables, "
        "a red apple, green herbs, and a ceramic plate with a delicious warm meal beside it. "
        "Warm cream background, soft peach and sage green accents, painterly illustration, "
        "flat design with subtle shadows, cheerful and inviting, high detail, "
        "professional App Store icon quality. Fill the entire square edge to edge."
    ),
    "bold": (
        "A striking modern iOS app icon 1024x1024 pixels, square, no rounded corners, "
        "no text, no letters. Deep navy background with a vibrant plate of colorful food "
        "as the focal point - orange curry, green herbs, red tomatoes. Bold contrasting "
        "colors, dramatic lighting, clean vector illustration style, premium App Store "
        "icon quality. Fill the entire square edge to edge, no white borders."
    ),
    "playful": (
        "A cute playful iOS app icon 1024x1024 pixels, square, no rounded corners, "
        "no text, no letters. A cheerful cartoon refrigerator with a smiling face made "
        "of an apple and tomato peeking out. Pastel peach background, rounded friendly "
        "shapes, bright colors, kawaii style, hand-drawn feel. Fill the entire square "
        "edge to edge, premium App Store icon quality."
    ),
    "minimal": (
        "A minimalist iOS app icon 1024x1024 pixels, square, no rounded corners, "
        "no text, no letters. A single elegant white ceramic plate viewed from above "
        "with a simple sprig of green herb and one cherry tomato on it. Solid muted "
        "sage green background, geometric clean lines, sophisticated minimalist design, "
        "premium App Store icon quality. Fill the entire square edge to edge."
    ),
}


async def _generate_icon_bytes(prompt: str) -> bytes:
    """Generate a 1024x1024 icon PNG via Gemini Nano Banana."""
    chat = LlmChat(
        api_key=os.getenv("EMERGENT_LLM_KEY"),
        session_id=f"icon-{uuid.uuid4().hex[:8]}",
        system_message="You are a professional app icon designer for the Apple App Store.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
        modalities=["image", "text"]
    )
    msg = UserMessage(text=prompt)
    _text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        raise HTTPException(status_code=502, detail="Image generation returned no images")
    raw = _b64.b64decode(images[0]["data"])
    # Ensure output is exactly 1024x1024 RGB (Apple requirement: no alpha)
    img = _PILImage.open(_io.BytesIO(raw)).convert("RGB")
    if img.size != (1024, 1024):
        img = img.resize((1024, 1024), _PILImage.LANCZOS)
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@api_router.get("/icon/{style}")
async def app_icon(style: str):
    if style not in _ICON_PROMPTS:
        raise HTTPException(status_code=404, detail="Unknown icon style")
    png = await _generate_icon_bytes(_ICON_PROMPTS[style])
    return _FastAPIResponse(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="manifeast-icon-{style}.png"'},
    )


@api_router.post("/icon/custom")
async def app_icon_custom(payload: dict):
    prompt = (payload or {}).get("prompt", "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    full = (
        f"An iOS app icon 1024x1024 pixels, square, no rounded corners, "
        f"no text, no letters, fill the entire square edge to edge. "
        f"{prompt}. Premium App Store icon quality."
    )
    png = await _generate_icon_bytes(full)
    return _FastAPIResponse(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="manifeast-icon-custom.png"'},
    )


# ---------- App Store screenshot resizer ----------
# Apple requires 6.9" iPhone screenshots at 1290x2796. iPhone 12 mini takes
# screenshots at 1080x2340 (same aspect). This resizes with high-quality
# LANCZOS and returns a PNG ready to upload to App Store Connect.


@api_router.post("/screenshot/resize")
async def screenshot_resize(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    try:
        src = _PILImage.open(_io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image")
    target_w, target_h = 1290, 2796
    # Fit inside the target (letterbox if aspect differs)
    src_ratio = src.width / src.height
    target_ratio = target_w / target_h
    if abs(src_ratio - target_ratio) < 0.01:
        # Same aspect - direct resize
        resized = src.resize((target_w, target_h), _PILImage.LANCZOS)
    else:
        # Pad with sampled corner color to keep aspect ratio
        pad_color = src.getpixel((5, 5))
        if src_ratio > target_ratio:
            new_h = int(target_w / src_ratio)
            fitted = src.resize((target_w, new_h), _PILImage.LANCZOS)
            resized = _PILImage.new("RGB", (target_w, target_h), pad_color)
            resized.paste(fitted, (0, (target_h - new_h) // 2))
        else:
            new_w = int(target_h * src_ratio)
            fitted = src.resize((new_w, target_h), _PILImage.LANCZOS)
            resized = _PILImage.new("RGB", (target_w, target_h), pad_color)
            resized.paste(fitted, ((target_w - new_w) // 2, 0))
    buf = _io.BytesIO()
    resized.save(buf, format="PNG", optimize=True)
    return _FastAPIResponse(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="app-store-screenshot.png"'},
    )


@api_router.get("/screenshot/upload-page")
async def screenshot_upload_page():
    html = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manifeast Screenshot Resizer</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#87A186;color:#fff;margin:0;padding:24px;min-height:100vh}
  h1{font-size:28px;margin:0 0 8px}
  p{opacity:.9;line-height:1.4}
  .card{background:#fff;color:#222;border-radius:16px;padding:24px;margin-top:20px;box-shadow:0 8px 32px rgba(0,0,0,.15)}
  input[type=file]{width:100%;padding:16px;background:#f5f5f5;border:2px dashed #87A186;border-radius:12px;font-size:16px}
  button{width:100%;background:#87A186;color:#fff;border:none;padding:16px;border-radius:12px;font-size:17px;font-weight:600;margin-top:12px}
  button:disabled{opacity:.5}
  .status{margin-top:16px;padding:12px;background:#f0f0f0;border-radius:8px;font-size:14px;display:none}
  .status.show{display:block}
  img.preview{width:100%;border-radius:12px;margin-top:12px}
  a.dl{display:block;text-align:center;background:#333;color:#fff;padding:14px;border-radius:12px;margin-top:12px;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<h1>Screenshot Resizer</h1>
<p>Resize your iPhone 12 mini screenshots to Apple's required 1290×2796 App Store size.</p>
<div class="card">
  <input type="file" id="file" accept="image/*">
  <button id="go" disabled>Resize for App Store</button>
  <div class="status" id="status"></div>
  <img class="preview" id="preview" style="display:none">
  <a class="dl" id="dl" style="display:none" download="app-store-screenshot.png">Save to Photos / Files</a>
</div>
<script>
const f=document.getElementById('file'),b=document.getElementById('go'),s=document.getElementById('status'),p=document.getElementById('preview'),dl=document.getElementById('dl');
f.onchange=()=>b.disabled=!f.files.length;
b.onclick=async()=>{
  s.className='status show';s.textContent='Uploading & resizing…';b.disabled=true;p.style.display='none';dl.style.display='none';
  const fd=new FormData();fd.append('file',f.files[0]);
  try{
    const r=await fetch('/api/screenshot/resize',{method:'POST',body:fd});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const blob=await r.blob();const url=URL.createObjectURL(blob);
    p.src=url;p.style.display='block';dl.href=url;dl.style.display='block';
    s.textContent='Done! Tap "Save to Photos" then long-press → Save Image.';
  }catch(e){s.textContent='Error: '+e.message}
  b.disabled=false;
};
</script>
</body>
</html>
    """
    return _FastAPIResponse(content=html, media_type="text/html")




app.include_router(api_router)

# App is stateless & tokenless — no cookies, no credentials to protect.
# Restrict origins to prod + preview by default; overridable via CORS_ORIGINS env.
_DEFAULT_ORIGINS = "https://manifeast.ie,https://www.manifeast.ie,https://manifest.ie,https://www.manifest.ie,https://whatieat.emergent.host,https://www.whatieat.emergent.host,https://whatieat.preview.emergentagent.com,capacitor://localhost,ionic://localhost"
_raw_origins = os.environ.get("CORS_ORIGINS", _DEFAULT_ORIGINS).strip()
if _raw_origins in ("", "*"):
    logging.warning("CORS_ORIGINS='%s' rejected — falling back to safe default allow-list.", _raw_origins)
    _raw_origins = _DEFAULT_ORIGINS
_cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def _retire_incomplete_recipes() -> None:
    """Hide every stored meal that isn't a fully cookable recipe (soft flag,
    no deletes). Inspire categories left with too few complete recipes are
    marked expired so they regenerate with fresh, complete ones."""
    try:
        retired = 0
        async for doc in db.recipes_store.find({"retired": {"$ne": True}}, {"_id": 0, "cached_at": 0, "last_accessed": 0}):
            try:
                ok = _is_cookable(Recipe(**{k: v for k, v in doc.items() if k != "retired"}))
            except Exception:
                ok = False
            if not ok:
                await db.recipes_store.update_one({"id": doc.get("id")}, {"$set": {"retired": True}})
                retired += 1
        async for doc in db.inspire_cache.find({}):
            good = []
            for r in doc.get("recipes", []):
                try:
                    if _is_cookable(Recipe(**r)):
                        good.append(r)
                except Exception:
                    pass
            if len(good) < 3:
                await db.inspire_cache.update_one(
                    {"_id": doc["_id"]}, {"$set": {"created_at": "2000-01-01T00:00:00+00:00"}}
                )
            elif len(good) != len(doc.get("recipes", [])):
                await db.inspire_cache.update_one({"_id": doc["_id"]}, {"$set": {"recipes": good}})
        logging.info("startup: retired %s incomplete stored recipes", retired)
    except Exception:
        logging.exception("startup retire pass failed")


@app.on_event("startup")
async def startup_event():
    await _ensure_recipe_store_index()
    asyncio.create_task(_retire_incomplete_recipes())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

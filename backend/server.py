from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
import uuid
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
LLM_MODEL_FAST = "gpt-4o-mini"  # smaller / faster / cheaper — used by /inspire
LLM_PROVIDER = "openai"

# Cache TTL for /inspire (server-side, shared across users) — 30 min
INSPIRE_CACHE_TTL_SECONDS = 30 * 60

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
) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message=system,
    ).with_model(LLM_PROVIDER, model)
    if json_mode:
        chat = chat.with_params(response_format={"type": "json_object"})

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


# ---------- Endpoints ----------
@api_router.get("/")
async def root():
    return {"message": "Manifeast API"}


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
    return [str(x).lower() for x in values or [] if isinstance(x, str)]


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


def _build_ingredients_detailed(raw) -> List["IngredientDetail"]:
    out: List[IngredientDetail] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            qty = str(item.get("quantity", "")).strip()
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
        return Recipe(
            id=str(uuid.uuid4()),
            title=title,
            emoji=str(r.get("emoji", "🍽️")).strip() or "🍽️",
            difficulty=str(r.get("difficulty", "easy")).strip().lower(),
            time_minutes=max(1, _coerce_int(r.get("time_minutes"), 15)),
            description=str(r.get("description", "")).strip(),
            ingredients_used=_str_list(r.get("ingredients_used")),
            missing_ingredients=_str_list(r.get("missing_ingredients")),
            ingredients_detailed=_build_ingredients_detailed(r.get("ingredients_detailed")),
            instructions=[str(x) for x in r.get("instructions", []) if isinstance(x, str)],
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
        "instructions (3–6 concise numbered steps that reference the same quantities), "
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

    recipes: List[Recipe] = []
    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        for r in raw_recipes:
            built = _build_recipe(r)
            if built is not None:
                recipes.append(built)
    except HTTPException:
        raise
    except Exception:
        logging.exception("suggest failed")
        raise HTTPException(status_code=500, detail="Recipe suggestion failed")

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    suggestion_id = str(uuid.uuid4())
    # Privacy: user ingredients / queries are not persisted.
    return SuggestResponse(id=suggestion_id, recipes=recipes)


@api_router.post("/ask-recipes", response_model=SuggestResponse)
@limiter.limit("60/hour")
async def ask_recipes(request: Request, req: AskRecipesRequest):
    q = _validate_text(req.query or "", MAX_QUERY_CHARS, "query")
    if not q:
        raise HTTPException(status_code=400, detail="query is required")
    n = max(3, min(req.max_recipes, 5))
    # Ask is a live user interaction — cap at 3 for speed (LLM is slow with more).

    system = (
        "You are a friendly recipe assistant. The user will tell you a dish, cuisine, or "
        f"craving. Return {n} DIFFERENT variations of it &mdash; classic, plus interesting "
        "twists (e.g. for 'cookies': classic chocolate chip, oatmeal raisin, peanut butter, "
        "no-bake, and one creative one). For each recipe return the same JSON schema as before: "
        "title, emoji, difficulty ('easy'|'medium'|'hard'), time_minutes (int), description "
        "(one sentence), ingredients_used (the full ingredient list, lowercase names only), "
        "missing_ingredients (empty array here since we don't know what they have), "
        "ingredients_detailed (REQUIRED — a complete ingredient list as an array of objects like "
        '{"name": "all-purpose flour", "quantity": "2 1/4 cups (280g)"} or '
        '{"name": "large eggs", "quantity": "2"} or {"name": "vanilla extract", "quantity": "1 tsp"}. '
        "Include EVERY ingredient with realistic measured quantities — cups/tbsp/tsp/g/ml/whole units. "
        "Do not omit staples like salt or oil), "
        "instructions (3-8 concise numbered steps that reference the quantities above), "
        "servings (int, default 2), "
        'yield_text (REQUIRED — short human-readable output like "Makes 24 cookies", '
        '"1 loaf (10 slices)", "Serves 4", "About 12 muffins"), '
        "nutrition object (calories, protein_g, fat_g, carbs_g per serving as integers, realistic), and "
        "image_query (2-4 lowercase comma-separated keywords describing the finished dish "
        "for a food photo, e.g. 'chocolate chip cookies, close up'). "
        'Return ONLY JSON: {"recipes": [ {...}, {...} ]}'
    )

    user_msg = UserMessage(text=f"Give me {n} different variations for: {q}")
    recipes: List[Recipe] = []
    try:
        # Use the faster model + json_mode for Ask — the prompt is text-only and
        # gpt-4o-mini is 3-4x faster than gpt-4o here, which prevents the timeout
        # / "network error" Apple reviewers hit on iPad.
        raw = await _run_chat(system, user_msg, model=LLM_MODEL_FAST, json_mode=True)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        for r in raw_recipes:
            built = _build_recipe(r)
            if built is not None:
                recipes.append(built)
    except HTTPException:
        raise
    except Exception:
        logging.exception("ask-recipes failed")
        raise HTTPException(status_code=500, detail="Recipe search failed")

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    suggestion_id = str(uuid.uuid4())
    await db.suggestions.insert_one(
        {
            "id": suggestion_id,
            "query": q,
            "recipes": [r.model_dump() for r in recipes],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return SuggestResponse(id=suggestion_id, recipes=recipes)


@api_router.post("/inspire", response_model=SuggestResponse)
@limiter.limit("60/hour")
async def inspire_meals(request: Request, req: InspireRequest):
    category = (req.category or "").strip().lower()
    allowed = {"breakfast", "lunch", "dinner", "snack", "dessert"}
    if category not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of {sorted(allowed)}",
        )
    n = max(3, min(req.count, 10))
    force_refresh = bool(getattr(req, "refresh", False))

    # ---- Server-side cache (shared across all users, 30 min TTL) ----
    now = datetime.now(timezone.utc)
    if not force_refresh:
        cached = await db.inspire_cache.find_one({"category": category})
        if cached:
            try:
                created = datetime.fromisoformat(cached["created_at"])
                age = (now - created).total_seconds()
                if age < INSPIRE_CACHE_TTL_SECONDS and cached.get("recipes"):
                    cached_recipes = [Recipe(**r) for r in cached["recipes"][:n]]
                    logging.info("inspire cache HIT %s (age=%ss)", category, int(age))
                    return SuggestResponse(id=cached["id"], recipes=cached_recipes)
            except Exception:
                logging.exception("inspire cache read failed — refetching")

    # ---- Cache miss: call the fast model ----
    system = (
        f"You are a creative recipe curator. Suggest {n} DIFFERENT and varied "
        f"{category} ideas someone could cook at home. Mix cuisines, flavor profiles, "
        "and difficulty. Avoid near-duplicates. Keep descriptions SHORT (max ~15 words). "
        "For each recipe return this JSON schema: "
        "title, emoji, difficulty ('easy'|'medium'|'hard'), time_minutes (int), "
        "description (one short appetizing sentence), "
        "ingredients_used (the full ingredient list, lowercase names only), "
        "missing_ingredients (empty array), "
        "ingredients_detailed (REQUIRED — array of objects like "
        '{"name": "rolled oats", "quantity": "1/2 cup (50g)"} covering every ingredient '
        "with realistic measured amounts), "
        "instructions (3-6 concise numbered steps that reference the quantities), "
        "servings (int, default 2), "
        'yield_text (REQUIRED short human-readable output like "Serves 2", '
        '"Makes 12 pancakes", "1 bowl"), '
        "nutrition object (calories, protein_g, fat_g, carbs_g per serving as integers, realistic), and "
        "image_query (2-4 lowercase comma-separated keywords for a food photo). "
        'Return ONLY JSON: {"recipes": [ {...}, {...} ]}'
    )

    user_msg = UserMessage(
        text=f"Give me {n} varied {category} ideas I could make today."
    )

    recipes: List[Recipe] = []
    try:
        raw = await _run_chat(system, user_msg, model=LLM_MODEL_FAST, json_mode=True)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        for r in raw_recipes:
            built = _build_recipe(r)
            if built is not None:
                recipes.append(built)
    except HTTPException:
        raise
    except Exception:
        logging.exception("inspire failed")
        raise HTTPException(status_code=500, detail="Inspiration failed")

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
                }
            },
            upsert=True,
        )
    except Exception:
        logging.exception("inspire cache write failed — returning uncached result")

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
_DEFAULT_ORIGINS = "https://manifeast.ie,https://www.manifeast.ie,https://manifest.ie,https://www.manifest.ie,https://whatieat.preview.emergentagent.com"
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

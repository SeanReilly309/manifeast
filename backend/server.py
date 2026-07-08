from fastapi import FastAPI, APIRouter, HTTPException
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

from pydantic import BaseModel, Field, ConfigDict

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
LLM_PROVIDER = "openai"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Models ----------
class ScanRequest(BaseModel):
    image_base64: str  # raw base64 (no data URL prefix expected; we'll strip if present)
    mime_type: Optional[str] = "image/jpeg"


class AnalyzeMealRequest(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"


class Ingredient(BaseModel):
    name: str
    confidence: Optional[float] = None


class ScanResponse(BaseModel):
    id: str
    ingredients: List[str]


class SuggestRequest(BaseModel):
    ingredients: List[str]
    max_recipes: int = 5


class AskRecipesRequest(BaseModel):
    query: str
    max_recipes: int = 5


class Nutrition(BaseModel):
    calories: int = 0
    protein_g: int = 0
    fat_g: int = 0
    carbs_g: int = 0


class Recipe(BaseModel):
    id: str
    title: str
    emoji: str
    difficulty: str  # easy / medium / hard
    time_minutes: int
    description: str
    ingredients_used: List[str]
    missing_ingredients: List[str]
    instructions: List[str]
    nutrition: Nutrition = Field(default_factory=Nutrition)
    servings: int = 1
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


async def _run_chat(system: str, user_msg: UserMessage) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message=system,
    ).with_model(LLM_PROVIDER, LLM_MODEL)

    buf = []
    async for ev in chat.stream_message(user_msg):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(buf)


# ---------- Endpoints ----------
@api_router.get("/")
async def root():
    return {"message": "Manifeast API"}


@api_router.post("/scan", response_model=ScanResponse)
async def scan_fridge(req: ScanRequest):
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
    except Exception as e:
        logging.exception("scan failed")
        raise HTTPException(status_code=500, detail=f"Vision analysis failed: {e}")

    scan_id = str(uuid.uuid4())
    await db.scans.insert_one(
        {
            "id": scan_id,
            "ingredients": cleaned,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return ScanResponse(id=scan_id, ingredients=cleaned)


def _str_list(values) -> List[str]:
    return [str(x).lower() for x in values or [] if isinstance(x, str)]


def _build_nutrition(raw: dict) -> "Nutrition":
    n = raw or {}
    return Nutrition(
        calories=int(n.get("calories", 0) or 0),
        protein_g=int(n.get("protein_g", 0) or 0),
        fat_g=int(n.get("fat_g", 0) or 0),
        carbs_g=int(n.get("carbs_g", 0) or 0),
    )


def _build_recipe(r: dict) -> Optional["Recipe"]:
    try:
        return Recipe(
            id=str(uuid.uuid4()),
            title=str(r.get("title", "Untitled")).strip(),
            emoji=str(r.get("emoji", "🍽️")).strip() or "🍽️",
            difficulty=str(r.get("difficulty", "easy")).strip().lower(),
            time_minutes=int(r.get("time_minutes", 15)),
            description=str(r.get("description", "")).strip(),
            ingredients_used=_str_list(r.get("ingredients_used")),
            missing_ingredients=_str_list(r.get("missing_ingredients")),
            instructions=[str(x) for x in r.get("instructions", []) if isinstance(x, str)],
            servings=int(r.get("servings", 1) or 1),
            nutrition=_build_nutrition(r.get("nutrition")),
            image_query=str(r.get("image_query", "")).strip().lower(),
        )
    except Exception:
        return None


@api_router.post("/suggest", response_model=SuggestResponse)
async def suggest_recipes(req: SuggestRequest):
    if not req.ingredients:
        raise HTTPException(status_code=400, detail="ingredients list is required")

    ingredient_list = ", ".join(req.ingredients)
    n = max(3, min(req.max_recipes, 5))

    system = (
        "You are a friendly home-cook recipe assistant. Given a list of ingredients the user has, "
        f"suggest {n} realistic meal ideas that prioritize using ONLY the items they have. "
        "It's fine if a recipe needs 1–3 small extra items (oil, salt, pepper, herbs, garlic, butter "
        "are considered pantry staples and should NOT be listed as missing). For each recipe, return: "
        "title (short, appetizing), emoji (single food emoji), difficulty ('easy' or 'medium'), "
        "time_minutes (integer total time), description (1 short sentence), ingredients_used (list of "
        "lowercase strings from the user's list that are used), missing_ingredients (list of lowercase "
        "items the user does NOT have), instructions (3–6 concise numbered steps), "
        "servings (integer, default 1), and nutrition (object with calories, protein_g, fat_g, carbs_g "
        "as integers — estimate PER SERVING based on typical ingredient amounts; be realistic, not zero), "
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
    except Exception as e:
        logging.exception("suggest failed")
        raise HTTPException(status_code=500, detail=f"Recipe suggestion failed: {e}")

    if not recipes:
        raise HTTPException(status_code=500, detail="No recipes returned")

    suggestion_id = str(uuid.uuid4())
    await db.suggestions.insert_one(
        {
            "id": suggestion_id,
            "ingredients": req.ingredients,
            "recipes": [r.model_dump() for r in recipes],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return SuggestResponse(id=suggestion_id, recipes=recipes)


@api_router.post("/ask-recipes", response_model=SuggestResponse)
async def ask_recipes(req: AskRecipesRequest):
    q = (req.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is required")
    n = max(3, min(req.max_recipes, 6))

    system = (
        "You are a friendly recipe assistant. The user will tell you a dish, cuisine, or "
        f"craving. Return {n} DIFFERENT variations of it &mdash; classic, plus interesting "
        "twists (e.g. for 'cookies': classic chocolate chip, oatmeal raisin, peanut butter, "
        "no-bake, and one creative one). For each recipe return the same JSON schema as before: "
        "title, emoji, difficulty ('easy'|'medium'|'hard'), time_minutes (int), description "
        "(one sentence), ingredients_used (the full ingredient list, lowercase), "
        "missing_ingredients (empty array here since we don't know what they have), "
        "instructions (3-8 concise numbered steps), servings (int), nutrition object "
        "(calories, protein_g, fat_g, carbs_g per serving as integers, realistic), and "
        "image_query (2-4 lowercase comma-separated keywords describing the finished dish "
        "for a food photo, e.g. 'chocolate chip cookies, close up'). "
        'Return ONLY JSON: {"recipes": [ {...}, {...} ]}'
    )

    user_msg = UserMessage(text=f"Give me {n} different variations for: {q}")
    recipes: List[Recipe] = []
    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        for r in raw_recipes:
            built = _build_recipe(r)
            if built is not None:
                recipes.append(built)
    except Exception as e:
        logging.exception("ask-recipes failed")
        raise HTTPException(status_code=500, detail=f"Recipe search failed: {e}")

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


@api_router.post("/analyze-meal", response_model=MealAnalysis)
async def analyze_meal(req: AnalyzeMealRequest):
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
    except Exception as e:
        logging.exception("analyze-meal failed")
        raise HTTPException(status_code=500, detail=f"Meal analysis failed: {e}")

    await db.meal_analyses.insert_one(
        {
            "id": analysis.id,
            "meal_name": analysis.meal_name,
            "nutrition": analysis.nutrition.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return analysis


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

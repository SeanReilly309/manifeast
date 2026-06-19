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


class Ingredient(BaseModel):
    name: str
    confidence: Optional[float] = None


class ScanResponse(BaseModel):
    id: str
    ingredients: List[str]


class SuggestRequest(BaseModel):
    ingredients: List[str]
    max_recipes: int = 5


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


class SuggestResponse(BaseModel):
    id: str
    recipes: List[Recipe]


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
    return {"message": "What Can I Eat? API"}


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

    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        ingredients = data.get("ingredients", []) if isinstance(data, dict) else []
        # normalize
        seen = set()
        cleaned = []
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
        "items the user does NOT have), instructions (3–6 concise numbered steps). "
        'Return ONLY JSON of the form: {"recipes": [ {...}, {...} ]}'
    )

    user_text = (
        f"My ingredients: {ingredient_list}.\n"
        f"Give me {n} meal ideas. Favor ones with the fewest missing items."
    )
    user_msg = UserMessage(text=user_text)

    try:
        raw = await _run_chat(system, user_msg)
        data = _extract_json(raw)
        raw_recipes = data.get("recipes", []) if isinstance(data, dict) else []
        recipes: List[Recipe] = []
        for r in raw_recipes:
            try:
                recipes.append(
                    Recipe(
                        id=str(uuid.uuid4()),
                        title=str(r.get("title", "Untitled")).strip(),
                        emoji=str(r.get("emoji", "🍽️")).strip() or "🍽️",
                        difficulty=str(r.get("difficulty", "easy")).strip().lower(),
                        time_minutes=int(r.get("time_minutes", 15)),
                        description=str(r.get("description", "")).strip(),
                        ingredients_used=[str(x).lower() for x in r.get("ingredients_used", []) if isinstance(x, str)],
                        missing_ingredients=[str(x).lower() for x in r.get("missing_ingredients", []) if isinstance(x, str)],
                        instructions=[str(x) for x in r.get("instructions", []) if isinstance(x, str)],
                    )
                )
            except Exception:
                continue
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

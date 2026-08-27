"""Diagnostic: capture raw LLM output for /api/inspire prompt to RCA the 500."""
import asyncio
import json
import sys

sys.path.insert(0, "/app/backend")
import server  # noqa: E402
from server import UserMessage, _run_chat, _extract_json, _build_recipe, LLM_MODEL_FAST  # noqa: E402


async def main(category="lunch", n=8):
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
        "instructions (REQUIRED — 3-6 concise numbered steps that reference the quantities; NEVER return empty), "
        "servings (int, default 2), "
        'yield_text (REQUIRED short human-readable output like "Serves 2", '
        '"Makes 12 pancakes", "1 bowl"), '
        "nutrition object (calories, protein_g, fat_g, carbs_g per serving as integers, realistic), and "
        "image_query (2-4 lowercase comma-separated keywords for a food photo). "
        'Return ONLY JSON: {"recipes": [ {...}, {...} ]}'
    )
    msg = UserMessage(text=f"Give me {n} varied {category} ideas I could make today.")
    raw = await _run_chat(system, msg, model=LLM_MODEL_FAST, json_mode=True)
    print("RAW LEN:", len(raw))
    print("RAW TAIL:", repr(raw[-300:]))
    try:
        data = _extract_json(raw)
    except Exception as e:
        print("JSON PARSE FAILED:", e)
        print("RAW HEAD:", raw[:500])
        return
    print("TOP KEYS:", list(data.keys()) if isinstance(data, dict) else type(data))
    recs = data.get("recipes", []) if isinstance(data, dict) else []
    print("RAW RECIPE COUNT:", len(recs))
    for r in recs:
        instr = r.get("instructions")
        built = _build_recipe(r)
        print(
            f"  - {r.get('title')!r} raw_instr={type(instr).__name__}:"
            f"{len(instr) if isinstance(instr, list) else instr!r}"
            f" built={'None' if built is None else len(built.instructions)}"
        )
    if recs and not any(isinstance(r.get("instructions"), list) and r["instructions"] for r in recs):
        print(">>> ALL RECIPES MISSING INSTRUCTIONS - sample recipe json:")
        print(json.dumps(recs[0], indent=2)[:1500])


if __name__ == "__main__":
    cat = sys.argv[1] if len(sys.argv) > 1 else "lunch"
    cnt = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    asyncio.run(main(cat, cnt))

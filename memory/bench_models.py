import asyncio, sys, time
sys.path.insert(0, "/app/backend")
import server as s
from emergentintegrations.llm.chat import UserMessage

SYSTEM = (
    "You are a friendly recipe assistant. Write the complete recipe for \"Classic Lasagne\". "
    "Return: title, emoji, difficulty, time_minutes, description, ingredients_used, missing_ingredients (empty), "
    "ingredients_detailed (array of {name, quantity}), "
    + s.DIRECT_INSTRUCTIONS_RULE + "servings, yield_text, nutrition {calories, protein_g, fat_g, carbs_g}, image_query. "
    'Return ONLY JSON: {"recipes": [ {...} ]}'
)

async def one(provider, model):
    t = time.time()
    try:
        raw = await s._run_chat(SYSTEM, UserMessage(text="Give me the full recipe for \"Classic Lasagne\""), model=model, json_mode=(provider == "openai"), provider=provider)
        data = s._extract_json(raw)
        recs = [s._build_recipe(r) for r in data.get("recipes", [])]
        ok = sum(1 for r in recs if r and s._is_cookable(r))
        temps = sum(1 for r in recs if r for st in r.steps if st.temperature_c)
        return f"{provider}/{model}: {time.time()-t:.1f}s chars={len(raw)} cookable={ok}/{len(recs)} oven-temps={temps}"
    except Exception as e:
        return f"{provider}/{model}: ERR {str(e)[:120]} {time.time()-t:.1f}s"

MODELS = [m.split(":") for m in sys.argv[1:]]

async def main():
    for r in await asyncio.gather(*[one(p, m) for p, m in MODELS]):
        print(r)

asyncio.run(main())

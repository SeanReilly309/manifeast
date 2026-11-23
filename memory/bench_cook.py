import asyncio, sys, time, json
sys.path.insert(0, "/app/backend")
import server as s
from emergentintegrations.llm.chat import UserMessage
sys.argv += ["beef stew"]
exec(open("/tmp/bench.py").read().split("async def one")[0])
def why(r):
    if r is None: return "none"
    out=[]
    if r.time_minutes<=0: out.append("time")
    bad=[i for i in r.ingredients_detailed if not i.quantity.strip()]
    if len(r.ingredients_detailed)<3: out.append("few ings")
    if bad: out.append(f"noqty:{[i.name for i in bad]}")
    if len(r.steps)<3: out.append(f"steps={len(r.steps)}")
    if r.steps and not any(st.heat or st.temperature_c or st.duration_minutes for st in r.steps): out.append("nometa")
    return out
async def main():
    raw = await s._run_chat(system(3), UserMessage(text="Give me 3 variations for: beef stew"), model="gpt-4o-mini", json_mode=True)
    data = s._extract_json(raw)
    for r in data.get("recipes", []):
        b=s._build_recipe(r); print(b.title if b else None, why(b), s._is_cookable(b))
asyncio.run(main())

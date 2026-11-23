import asyncio, sys, time
sys.path.insert(0, "/app/backend")
import server as s
from emergentintegrations.llm.chat import UserMessage
angles = "; ".join(f"{i + 1}) {a}" for i, a in enumerate(s.ASK_ANGLES))
SYSTEM = ("You are a recipe assistant. The user names a dish, cuisine or craving. "
    f"Suggest exactly 3 clearly different, real, cookable recipes in this order: {angles}. "
    "Each title must be unique and reflect its angle. For each return: title, emoji (one food emoji), "
    "description (max 15 words), difficulty ('easy'|'medium'|'hard'), time_minutes (int total), "
    "image_query (2-4 lowercase keywords for a food photo of the finished dish). "
    'Return ONLY JSON: {"ideas": [ {...} ]}')
async def one(p, m):
    t=time.time()
    try:
        raw = await s._run_chat(SYSTEM, UserMessage(text="beef tacos"), model=m, json_mode=True, provider=p)
        return f"{p}/{m}: {time.time()-t:.1f}s {len(raw)}"
    except Exception as e: return f"{p}/{m}: ERR {str(e)[:80]}"
async def main():
    for r in await asyncio.gather(*[one(*x.split(":")) for x in sys.argv[1:]]): print(r)
asyncio.run(main())

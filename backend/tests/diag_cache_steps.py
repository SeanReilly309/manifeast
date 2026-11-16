"""Diagnostic: summarise structured steps in inspire_cache (read-only)."""
import os, asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    async for doc in db.inspire_cache.find({}):
        recs = doc.get("recipes", [])
        print("==", doc["category"], doc["created_at"], "recipes:", len(recs))
        for r in recs:
            st = r.get("steps", [])
            heat = sum(1 for s in st if s.get("heat"))
            dur = sum(1 for s in st if (s.get("duration_minutes") or 0) > 0)
            ing = sum(1 for s in st if s.get("ingredients"))
            print(f"  {r['title'][:40]:40} steps={len(st)} instr={len(r.get('instructions', []))} heat={heat} dur={dur} ing={ing}")
        if recs:
            print("  sample step:", recs[0]["steps"][1] if len(recs[0]["steps"]) > 1 else recs[0]["steps"])

asyncio.run(main())

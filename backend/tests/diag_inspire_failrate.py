"""Diagnostic: how often does /api/inspire?refresh=true fail with 500 (instructions-as-objects RCA)."""
import os
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")

results = []
for cat in ["breakfast", "dinner", "lunch", "dessert", "snack", "breakfast"]:
    r = requests.post(f"{BASE}/api/inspire", json={"category": cat, "refresh": True}, timeout=120)
    if r.status_code == 200:
        recs = r.json()["recipes"]
        empt = sum(1 for x in recs if not x.get("instructions"))
        results.append(f"{cat}: 200 recipes={len(recs)} empty_instr={empt}")
    else:
        results.append(f"{cat}: {r.status_code} {r.text[:80]}")
    print(results[-1])

fails = sum(1 for x in results if ": 200" not in x)
print(f"\nFAIL RATE: {fails}/{len(results)}")

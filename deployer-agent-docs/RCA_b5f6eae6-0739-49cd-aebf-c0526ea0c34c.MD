# RCA — "Couldn't load this recipe" on Inspire → Recipe Detail → Start Cooking

App: whatieat (manifeast.ie / https://whatieat.emergent.host) — FastAPI + MongoDB
Live run: `b5f6eae6-0739-49cd-aebf-c0526ea0c34c` (redeploy, completed 2026-11-19T08:48:13Z)
DB: `whatieat-test_database`

## Verdict
The Inspire grid shows recipe cards taken from `inspire_cache`, but the **detail docs for many of those cards do not exist in `recipes_store`**, so `GET /api/recipe/{id}` returns **404 → "Couldn't load this recipe."** It is per-card intermittent exactly as reported: cards whose cache was written by the *current* build work; cards whose cache was written by the *previous* build fail.

## Root cause (confirmed by DB + source)
`POST /api/inspire` cache-HIT path returns cached recipe cards to the UI **without re-validating them** against the current `_is_cookable` completeness filter:

```
cached_recipes = [Recipe(**r) for r in cached["recipes"][:n]]   # no _is_cookable check
await _persist_recipes(cached_recipes)                          # persists ONLY cookable ones
return SuggestResponse(id=cached["id"], recipes=cached_recipes) # returns ALL (incl. non-cookable)
```
`_persist_recipes` (and `GET /api/recipe/{id}`) enforce `_is_cookable`, which the current build requires to include **≥3 cooking steps** (structured `steps` or legacy `instructions`). Recipes cached by the previous build have **no steps** → they are served as cards but never land in `recipes_store` → detail fetch 404s.

## Evidence

### 1. Missing detail docs (the smoking gun)
- `inspire_cache`: 5 docs (1 per category), total **51 recipe IDs** referenced.
  - breakfast: 12 recipes, created **2026-11-23T16:45Z** (after deploy)
  - dessert: 12 recipes, created **2026-11-19T08:55Z** (after deploy)
  - snack: 9 recipes, created **2026-11-19T08:29Z** (BEFORE 08:48 deploy)
  - dinner: 9 recipes, created **2026-11-19T08:29Z** (BEFORE deploy)
  - lunch: 9 recipes, created **2026-11-19T08:29Z** (BEFORE deploy)
- `recipes_store`: 66 docs. Of the 51 cached IDs, **only 23 exist** in `recipes_store` → **~27–28 missing**.
- Present IDs map exactly to **breakfast + dessert** (caches created AFTER the current deploy). Missing IDs = **all of snack + dinner + lunch (27)** — caches created at 08:29, **before** the 08:48 deploy. Perfect correlation with build boundary.

### 2. Why the pre-deploy cache fails the current filter
Full dump of the `dinner` cache (9 recipes) shows every recipe has:
- `instructions: []` (empty) and **no `steps` field** at all
- e.g. "Spicy Chickpea Tacos", "Moroccan Chicken Tagine", "Spanish Paella" — all stepless
These fail the current `_is_cookable` ("≥3 cooking steps with non-empty text"), so `_persist_recipes` skips them, but the HIT path still returns them as cards.

### 3. `recipes_store` is clean (so this is NOT a "failed cookability on read" / bad-data-in-store problem)
- Docs with empty `steps` AND empty `instructions`: **0**
- Docs with any `ingredients_detailed` entry with empty `quantity`: **0**
The broken recipes live ONLY in `inspire_cache`; they were never persisted. The `"failed cookability on read — treating as 404"` branch is therefore NOT the active path — the 404 happens earlier, at `find_one` returning nothing.

### 4. Backend logs (Loki, last ~24h, newest-first)
- Window dominated by localhost `GET /health` 404 probes (the backend has no `/health` route — returns 404; harmless, health_check accepts non-5xx).
- `POST /api/inspire`: 200 OK (multiple); `POST /api/ask-recipes`: all 200 OK. **No exceptions** in either handler.
- **No `429` / rate-limit** hits on `/api/inspire` or `/api/recipe` in the window.
- **No `GET /api/recipe/*`** lines surfaced in the retrieved window and **no "failed cookability on read"** lines — consistent with the frontend serving detail from localStorage and the 404s being low-volume cache-miss taps. (Rate-limiting is NOT implicated.)
- uvicorn access logs carry no timing, so a numeric `POST /api/ask-recipes` latency cannot be given from logs; all observed calls returned 200.
- One `Traceback` + `Exception ignored when trying to write to the signal wakeup fd` = pod shutdown/signal artifact during a restart, not a request-handler error.

### 5. Deployed build / version
- Live run `b5f6eae6-0739-49cd-aebf-c0526ea0c34c`, image `.../whatieat:b5f6eae6-0739-49cd-aebf-c0526ea0c34c`, redeploy completed **2026-11-19T08:48:13Z**. Build state SUCCESS.
- No git SHA is embedded or retrievable (pull_source strips `.git`; build logs carry no commit ref). Correlate by the 2026-11-19 08:48 UTC timestamp.
- The live `server.py` IS the latest code described: cache-HIT path serves without re-filtering; `_persist_recipes` and `GET /recipe` both enforce `_is_cookable` (requires ≥3 steps). Confirmed in the run's source.

### Aggravating factor — stale cache beyond TTL
`INSPIRE_CACHE_TTL_SECONDS = 4h`, yet snack/dinner/lunch docs are 4+ days old and still live. Those categories simply weren't re-fetched (low traffic), so the write-through never overwrote the pre-deploy docs; and they predate the step requirement. The frontend also holds these stepless cards in localStorage, so users keep tapping IDs that will always 404 until both the cache and the client cache are refreshed.

## Suggested fixes (no data changed)
1. **Code (E1):** In `POST /api/inspire` cache-HIT path, run cached recipes through `_is_cookable` before returning — drop non-cookable ones and, if fewer than `n` remain, treat the cache as a miss and refetch. This restores symmetry with `_persist_recipes` / `GET /api/recipe`. Optionally add a cache schema/version tag so caches written by an older build are auto-invalidated.
2. **Data (production):** Invalidate/delete the 3 stale pre-deploy `inspire_cache` docs (snack, dinner, lunch — created 2026-11-19T08:29Z) so they regenerate with steps. Not changed here per instructions.
3. **Client:** Users need a hard refresh / cache clear (and the iOS app its local cache) because the stepless recipe IDs are also cached in localStorage and will keep 404-ing until refreshed.

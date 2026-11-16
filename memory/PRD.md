# Manifeast (What Can I Eat?) — PRD

## Original Problem Statement
Take a photo of fridge/cupboard → app tells you 3–5 meal ideas, difficulty, cook time, with a shopping list for missing items. Mobile-first PWA.

## User Choices
- Vision + text model: **GPT-4o** (OpenAI) via Emergent Universal LLM Key
- Auth: **None** (anonymous, localStorage-backed)
- Affiliate links: Tesco / Lidl / Amazon Fresh (region-aware UK/US)
- Design vibe: **Warm/cozy kitchen** (Cormorant Garamond + Outfit, terracotta/sage/bone)
- Mobile-first mandate (7-tab bottom nav)
- Brand: **Manifeast** (live at https://manifest.ie)

## Architecture
- Backend: FastAPI + Motor (MongoDB) + emergentintegrations LlmChat (gpt-4o)
- Frontend: React 19 + react-router + Tailwind + shadcn/ui + sonner toasts + React Context (localStorage persistence)
- API prefix: `/api`, served on internal :8001, exposed via REACT_APP_BACKEND_URL

## API Endpoints
- `GET /api/` — health
- `POST /api/scan` — fridge photo → `{ ingredients: [..] }` (GPT-4o vision)
- `POST /api/suggest` — ingredient list → `{ recipes: [...] }` with `yield_text` + `ingredients_detailed`
- `POST /api/ask-recipes` — text query → recipe variations
- `POST /api/analyze-meal` — plate photo → nutrition estimation
- `POST /api/inspire` — `{category, count, coach?, diets?}` → curated meal ideas by category, personalized by Coach hint and filtered by diets

## Recipe Schema
`id, title, emoji, difficulty, time_minutes, description, ingredients_used[], missing_ingredients[], ingredients_detailed[{name, quantity}], instructions[], nutrition{calories,protein_g,fat_g,carbs_g}, servings, yield_text, image_query`

## Implemented
### Feb 19, 2026 (initial MVP)
- Home, Scan (camera/upload or manual), Results, Recipe Detail, Shopping List with affiliate deep links

### Feb 2026 (extended)
- Favorites, Share, Cook Mode (full-screen step-by-step), About page
- Meal Analysis from plate photo (`/analyze`)
- Meal Log (`/log`) with daily targets, 7-day averages, goal celebration
- Home Today Dashboard (live macros)
- Coach page (BMI/BMR/TDEE + macros)
- Ask Recipes (`/ask`) with search + preset chips
- Dynamic recipe images via `image_query`
- PWA icons + manifest, rebranded to Manifeast
- **Deployed to production** at https://manifest.ie

### Feb 10, 2026 (this session)
- **Recipe quantities + yield**: `ingredients_detailed[{name, quantity}]` and `yield_text` on every recipe endpoint. RecipeDetail shows a measured ingredients list and a prominent yield pill.
- **Inspire Me**: new `/inspire` page with 5 category tabs (Breakfast, Lunch, Dinner, Snacks, Desserts), 8 ideas per tab, per-category cache, Shuffle button, Coach-profile personalization. Added to bottom nav (now 7 tabs). Fixed duplicate "Coach" desktop link.
- **Dietary filters on Inspire**: 5 multi-select chips (Vegetarian, Vegan, Gluten-free, Low-carb, Dairy-free) with clear button, selection persisted via localStorage. Cache key includes diet combination.
- **Recipe scale toggle (½× / 1× / 2×)** on RecipeDetail: client-side `scaleQuantity` helper parses free-form quantity strings and rescales, snapping to clean fractions. Auto-pluralizes/depluralizes english measurement units. Also scales the yield pill and servings.
- **Security hardening** (per audit): (a) `slowapi` per-IP rate limits — 30/hr on image endpoints (`/scan`, `/analyze-meal`), 60/hr on text endpoints (`/suggest`, `/ask-recipes`, `/inspire`); (b) input size caps — image ≤ 10 MB base64, query ≤ 500 chars, ingredients ≤ 60 items × 80 chars; (c) generic error responses (no more stack/model internals leaking); (d) CORS locked down to `manifest.ie` + preview only, `allow_credentials=false`, methods restricted to GET/POST/OPTIONS + defensive guard against wildcard `.env`; (e) `.env` variants added to `.gitignore`; (f) removed unused security deps `python-jose`, `passlib`, `bcrypt`, `pyjwt`.

### Feb 27, 2026
- **Inspire → Cook Mode missing-instructions RCA (iteration_14)**: `gpt-4o-mini` sometimes returned instructions as `[{"step":1,"instruction":"..."}]` objects; old parser filtered non-strings → empty → 500. Added `_build_instructions()` normalizer (accepts str/dict, strips leading numbering) + one-shot retry in `/api/inspire`. Fail rate 0/6 (was 4/6).
- Fixed React duplicate-key warning on RecipeCard ingredient chips.
- **Direct instructions app-wide (iteration_16)**: `DIRECT_INSTRUCTIONS_RULE` applied to `/api/suggest`, `/api/ask-recipes`, `/api/inspire` — every step imperative-verb-first with exact quantities/times/temps, length scales with complexity (scrambled eggs 3-4, lasagne 12-15). `_is_cookable()` filter (≥2 steps AND ≥2 measured ingredients) + retry across all three endpoints.
- **Instant Inspire Shuffle (iteration_16)**: `/api/inspire` serves up to 12 recipes per pool; `InspireMe.jsx` fetches a pool of 12 once, displays a window of 3, Shuffle rotates the cursor by 3 (0ms, no server call). Full cycle silently refills the pool. `Load more` button removed.
- **Shopping list sharing (iteration_16)**: `lib/shareShop.js` encodes items into a base64url URL hash; new `/shop/import` page decodes and merges with silent-dedup. Top-level `[data-testid=share-list-btn]` + per-row `[data-testid=share-<name>]`. Single-item share auto-adds on open.

### Mar 1, 2026 — Persistent "recently viewed" recipe cache
- **Root cause of "Couldn't load this recipe"**: InspireMe's `setRecipes(results)` only persists the 3 currently-visible cards; when the pool refills in the background (shuffle wrap-around) OR another page like Scan/Ask/Favorites overwrites `recipes` state, the specific recipe the user opened disappears from every cache and Cook Mode's URL `/recipe/<id>/cook` can no longer resolve.
- **Fix**: New `rememberRecipe()` in AppContext persists every opened recipe to a sliding-cap (60) `manifeast_recent_recipes` localStorage list. Wired into `InspireMe.handleOpen`, `Ask.handleOpen`, `Results.handleOpen`, `Favorites.handleOpen`, plus a safety-net `useEffect` in `RecipeDetail` that remembers whichever recipe was successfully resolved. `findRecipeById` now also searches `LS_RECENT` as its 3rd lookup. Cook Mode now always finds any recipe the user has seen before, even weeks later.
- **Removed "starting guide" fallback**: Cook Mode no longer synthesises generic "Gather and measure…" steps or shows the "starting guide" banner. A recipe with zero instructions hits the proper error card instead; the `_is_cookable()` filter already prevents this in practice.
- **Backend `_step_ingredients_for` enrichment**: when the LLM returns bare-quantity entries like `["2", "1/2 cup", "1 tsp"]` for a step's `ingredients`, we now detect the missing name (regex over unit-words) and glue the right ingredient from `ingredients_detailed` onto it — producing `"2 eggs"`, `"1/2 cup milk"`, etc. No more "You'll use: 2 / 1/2 cup" rows.
- Verified end-to-end on preview: Inspire → RecipeDetail → Cook Mode opens the right recipe (verified distinct URLs + titles on 3 distinct cards), full steps with timer, per-step ingredients with full names + quantities.

### Feb 28, 2026 — Full Cook Mode rewrite
- **"No recipe to cook" bug SQUASHED**: CookMode & RecipeDetail previously only searched AppContext in-memory state, so a direct `/recipe/<id>/cook` URL, iOS cold start, or long-stale state would show "No recipe to cook" / "Recipe not found" even when the recipe was still in localStorage. New `lib/findRecipe.js` searches context + `wcie_recipes` + `manifeast_favorites` + ALL category pools in `manifeast_inspire_cache`. Verified: direct URL navigation resolves from each cache independently.
- **New `CookStep` data model**: every recipe now ships with `steps: List[CookStep]` where each step carries `{number, instruction, ingredients: List[str], heat, temperature_c, duration_minutes, doneness_cue}`. Backward-compatible `instructions: List[str]` is derived from `steps[i].instruction`. Applied to `/api/suggest`, `/api/ask-recipes`, `/api/inspire`.
- **DIRECT_INSTRUCTIONS_RULE prompt rewrite**: LLM now required to emit structured step objects with imperative verbs, exact quantities pulled verbatim from `ingredients_detailed` (e.g. `"300g chicken breast"`), heat one of {low, medium-low, medium, medium-high, high}, temperature in °C integer, duration in minutes, and a short doneness cue.
- **`_build_steps` helper**: parses the LLM payload, backfills `ingredients` via a heuristic when the LLM omits them, renumbers defensively, and falls back to synthesising structured steps from legacy string instructions.
- **`_normalise_heat` tolerant**: accepts "medium heat", "med-high", "high flame" etc.
- **Parallel batched LLM calls on `/api/inspire`**: count=12 now runs as 3× parallel calls of 4 recipes with different "angle" hints (comfort, light/veggie, international). Dropped from 60+s (ingress timeout → 502) to ~46s AND now returns the full 12 recipes (was only 8-9). Each batch failure is isolated so one bad batch doesn't fail the whole category.
- **CookMode UI**: structured meta chips per step — `[data-testid=cook-step-heat]`, `cook-step-temp`, `cook-step-duration`, `cook-step-cue`. Timer pre-populates from `duration_minutes` directly. Per-step ingredients prefer `currentStep.ingredients` (exact measured strings like "300g chicken breast") over the heuristic fallback. Ingredient text uses `first-letter:uppercase` (not `capitalize`) so measurements read naturally.
- Testing agent iteration_18: frontend 100%, backend structured-steps 3/4 before the inspire-timeout fix; after the parallel-batch fix inspire returns in 46s with 12/12 recipes.
- **"No recipe to cook" bug SQUASHED**: CookMode & RecipeDetail previously only searched AppContext in-memory state, so a direct `/recipe/<id>/cook` URL, iOS cold start, or long-stale state would show "No recipe to cook" / "Recipe not found" even when the recipe was still in localStorage. New `lib/findRecipe.js` searches context + `wcie_recipes` + `manifeast_favorites` + ALL category pools in `manifeast_inspire_cache`. Verified: direct URL navigation resolves from each cache independently.
- **Richer Cook Mode**: Full rewrite of `pages/CookMode.jsx` — header image with gradient overlay + title, Step X of Y counter, progress bar, Prev / Next / Finish, keyboard shortcuts (←/→/Space/Esc), per-step ingredient highlight (`lib/cookStep.js` → `ingredientsForStep`, naive substring + plural match with regex-escape safety), auto-detected per-step timer (`extractDuration` parses "20 min" / "1 hour 30 min" / "30 seconds" and skips outliers) with Play/Pause/Reset + vibration on done.
- **Cook Mode error state**: When the recipe truly can't be found, we now show a proper card "Couldn't load this recipe." with Try Again (reload) + Browse ideas buttons. No more bare "No recipe to cook." text anywhere.
- **Cook Mode fallback state**: If a recipe somehow has zero instructions, Cook Mode still opens with synthesised generic steps + a "Retry" banner that calls `/api/ask-recipes` for the title and swaps in a proper recipe.
- **Backend `_str_list` bug fixed**: When the LLM returned `ingredients_used` as a single comma-separated string, we were iterating it character by character ("r", "o", "l", "l", ...) which produced garbled single-letter chips on RecipeCard. Now splits on `,`/`\n`/`;` and accepts dict items with a `name` key.
- **Codemagic TestFlight fix**: Removed `beta_groups: ["Internal Testing"]` from `codemagic.yaml` — Apple's API now rejects assigning builds to internal groups ("Cannot add internal group to a build"). Internal testers auto-receive new builds once processing finishes.
- **Inspire → Cook Mode instruction bug FIXED** (RCA in iteration_14): gpt-4o-mini often returned instructions as an array of objects (`[{"step":1,"instruction":"..."}]`) instead of strings; `_build_recipe` filtered non-strings out → `instructions=[]` → 500 "No recipes returned" on ~67% of fresh Inspire calls. Added `_build_instructions()` normalizer in `server.py` that accepts str/dict (`step|text|instruction|description|content`) and strips leading numbering (`1.`, `Step 1:`, `3)`). `/api/inspire` now retries once before raising 500. Fix verified: diag fail rate 0/6 (was 4/6), pytest 28/28 (was 6/13), E2E 5/5 categories reach Cook Mode with valid numbered steps.
- Fixed React duplicate-key warning on RecipeCard ingredient chips (`key={\`${ing}-${i}\`}`).
- **Direct instructions across the app**: added `DIRECT_INSTRUCTIONS_RULE` prompt fragment applied to `/api/suggest`, `/api/ask-recipes`, and `/api/inspire`. Every step must start with an imperative verb (Preheat, Chop, Heat, Add, Stir, Simmer, Bake…), reference exact quantity/time/temperature, be one sentence of ~8-25 words, and use as many steps as the recipe genuinely needs — simple omelette 3-4 steps, lasagne 12-15 steps (no more hard cap).
- **Cookability filter everywhere**: `_is_cookable()` guard (≥2 steps AND ≥2 measured ingredients) applied to all three recipe endpoints. Each retries the LLM once before returning 500 so a whole category never fails from one flaky response.
- **Faster Inspire Shuffle (windowed pool)**: `/api/inspire` bumped to allow count=12; `InspireMe.jsx` now fetches a POOL of 12 recipes per category on tab load and shows a WINDOW of 3. Shuffle rotates the cursor by 3 with wrap — **0ms, no server call**, truly instant. Full cycle triggers a silent background pool refill so the next cycle is a fresh set. Removed redundant `Load more` button + `preShuffled` state.
- **Shopping list sharing**: new `/app/frontend/src/lib/shareShop.js` (base64url-in-hash encoder), new page `/shop/import` (`ImportShopping.jsx`) that decodes and merges into the recipient's localStorage list with duplicates silently skipped. Share buttons: top-level `[data-testid=share-list-btn]` on the Shopping page and per-row `[data-testid=share-<name>]` on each item — both call `navigator.share` with clipboard fallback. Single-item imports auto-add on open ("hey grab me milk" case).

## P1 Backlog
- Weight-tracking chart on Coach page
- Save "Ask" results in bulk to Favorites

## P2 Backlog
- Voice input for search bar (Ask + Scan manual entry)
- Native App Store wrapper (Capacitor / PWABuilder)
- User accounts / cloud sync
- Pantry memory (track what you have over time)
- Improve recipe hero image matching (occasional off-topic Unsplash fallback)
- Multi-language UI

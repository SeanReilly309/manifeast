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
- `POST /api/ask-recipes` — text query → recipe variations with `yield_text` + `ingredients_detailed`
- `POST /api/analyze-meal` — plate photo → nutrition estimation
- `POST /api/inspire` — `{category, count, coach?}` → curated meal ideas by category, personalized by Coach hint

## Recipe Schema (shared across suggest / ask-recipes / inspire)
`id, title, emoji, difficulty, time_minutes, description, ingredients_used[], missing_ingredients[], ingredients_detailed[{name, quantity}], instructions[], nutrition{calories,protein_g,fat_g,carbs_g}, servings, yield_text, image_query`

## Implemented
### Feb 19, 2026
- Home hero + 3-step explainer
- Scan (camera/upload OR manual entry chips)
- Results grid + Recipe Detail
- Shopping List with region-aware affiliate deep links
- LocalStorage persistence (ingredients/recipes/shopping)
- Full E2E tested (100% pass)

### Feb 2026 (later)
- Favorites, Share Recipe, Cook Mode (full-screen step-by-step)
- About page
- Meal Analysis from plate photo (`/analyze`)
- Meal Log (`/log`) with daily targets, 7-day averages, goal celebration
- Home Today Dashboard (live macros)
- Coach page (BMI/BMR/TDEE + macros from age/sex/height/weight/exercise/goal)
- Ask Recipes (`/ask`) with search bar + preset suggestions
- Dynamic recipe images via `image_query` (Loremflickr)
- PWA icons + manifest, rebranded to Manifeast
- **Deployed to production** at https://manifest.ie

### Feb 2026 — This session
- **Recipe quantities + yield** (Feb 10, 2026): Added `ingredients_detailed[{name, quantity}]` and `yield_text` fields on all recipe endpoints. RecipeDetail now shows a proper measured ingredients list and a prominent yield pill ("Makes 24 cookies", "Serves 4", "1 loaf (10 slices)").
- **Inspire Me** (Feb 10, 2026): New `/inspire` page with 5 category tabs (Breakfast, Lunch, Dinner, Snacks, Desserts), 8 curated ideas per tab, per-category localStorage cache, Shuffle button, and Coach-profile personalization (bias by goal + target kcal + protein). Backend `POST /api/inspire`. Added to bottom nav (now 7 tabs) and desktop top-nav. Fixed duplicate "Coach" desktop nav link.

## P1 Backlog
- Save Ask/Inspire results as Favorites explicitly (they already work if user hits ❤ on the card, but a "Save this handful" batch action would be nice)
- Weight-tracking chart on Coach page
- Recipe scale toggle (½× / 1× / 2×) that recalculates ingredient quantities

## P2 Backlog
- Voice input for search bar (Ask + Scan manual entry)
- Native App Store wrapper (Capacitor / PWABuilder)
- Dietary filters on Inspire (veg / gluten-free / low-carb)
- User accounts / cloud sync
- Pantry memory (track what you have over time)
- Multi-language UI

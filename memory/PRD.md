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
- **Recipe scale toggle (½× / 1× / 2×)** on RecipeDetail: client-side `scaleQuantity` helper parses free-form quantity strings (mixed numbers, plain/unicode fractions, decimals) and rescales, snapping to clean fractions. Auto-pluralizes/depluralizes english measurement units (cup ↔ cups, leaf ↔ leaves, etc.). Also scales the yield pill and servings.

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

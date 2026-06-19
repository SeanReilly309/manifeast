# What Can I Eat? — PRD

## Original Problem Statement
Take a photo of fridge/cupboard → app tells you 3–5 meal ideas, difficulty, cook time, with a shopping list for missing items.

## User Choices (Feb 2026)
- Vision model: **GPT-4o** (OpenAI) via Emergent Universal LLM Key
- Auth: **None** (anonymous, localStorage-backed)
- Affiliate links: **skipped** for MVP
- Design vibe: **Warm/cozy kitchen** (Cormorant Garamond + Outfit, terracotta/sage/bone)

## Architecture
- Backend: FastAPI + Motor (MongoDB) + emergentintegrations LlmChat (gpt-4o)
- Frontend: React 19 + react-router + Tailwind + shadcn/ui + sonner toasts + React Context (localStorage persistence)
- API prefix: `/api`, served on internal :8001, exposed via REACT_APP_BACKEND_URL

## API Endpoints
- `GET /api/` — health
- `POST /api/scan` `{ image_base64, mime_type }` → `{ id, ingredients: [..] }` (GPT-4o vision)
- `POST /api/suggest` `{ ingredients: [..], max_recipes }` → `{ id, recipes: [...] }`

## Implemented (Feb 19, 2026)
- Home (hero CTAs, 3-step explainer, bonus shopping band)
- Scan (camera/upload OR manual entry with chips, edit list)
- Results (recipe card grid with image, time, difficulty, missing items)
- Recipe Detail (image, ingredients used/missing, numbered instructions, add-to-shopping)
- Shopping List (toggle, remove, clear, badge count in nav)
- Sticky desktop top-nav + mobile bottom-nav with shopping badge
- LocalStorage persistence for ingredients/recipes/shopping
- Full E2E tested by testing_agent (100% backend + frontend pass)

## P1 Backlog
- Affiliate / deep links to Tesco / Lidl / Amazon Fresh from shopping list
- Save/favorite recipes
- Dietary filters (veg / gluten-free / low-carb)
- Ingredient normalization & substitutions
- Share recipe (link / image card)

## P2 Backlog
- User accounts / cloud sync
- Pantry memory (track what you have over time)
- Smart re-stock suggestions
- Multi-language UI

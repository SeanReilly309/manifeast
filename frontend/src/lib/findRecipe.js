// Robust cross-page recipe lookup.
//
// The app has recipes in several in-memory and localStorage caches:
//   - AppContext `recipes` (last set of results shown — Scan/Ask/Inspire card tap)
//   - AppContext `favorites`
//   - InspireMe's per-category pool  (localStorage key: manifeast_inspire_cache)
//
// RecipeDetail + CookMode used to only check the first two, so if the AppContext
// was cleared (iOS app relaunch, direct URL, long-stale state) the user would
// hit "Recipe not found" / "No recipe to cook" even though the recipe was still
// sitting in the Inspire cache on disk. This helper looks everywhere.

import { isCompleteRecipe } from "./recipeComplete";

const LS_INSPIRE_CACHE = "manifeast_inspire_cache_v3";
const LS_RECIPES = "wcie_recipes";
const LS_FAVORITES = "manifeast_favorites";
const LS_RECENT = "manifeast_recent_recipes_v2";

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function readInspirePools() {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(LS_INSPIRE_CACHE);
  const obj = safeParse(raw) || {};
  const out = [];
  for (const cat of Object.keys(obj)) {
    const list = Array.isArray(obj[cat]) ? obj[cat] : [];
    for (const r of list) out.push(r);
  }
  return out;
}

function readLSList(key) {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(key);
  const arr = safeParse(raw);
  return Array.isArray(arr) ? arr : [];
}

/**
 * Look up a recipe by id across every cache the app keeps. `contextRecipes`
 * and `contextFavorites` come from AppContext — passing them means we hit
 * the freshest in-memory copy first before falling back to disk.
 */
export function findRecipeById(id, { contextRecipes = [], contextFavorites = [] } = {}) {
  if (!id) return null;
  // Incomplete local copies are skipped so useRecipe falls back to the server.
  const sameId = (r) => r && r.id === id && isCompleteRecipe(r);
  return (
    contextRecipes.find(sameId) ||
    contextFavorites.find(sameId) ||
    readLSList(LS_RECENT).find(sameId) ||
    readLSList(LS_RECIPES).find(sameId) ||
    readLSList(LS_FAVORITES).find(sameId) ||
    readInspirePools().find(sameId) ||
    null
  );
}

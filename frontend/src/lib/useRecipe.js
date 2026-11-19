import { useEffect, useMemo, useState, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { findRecipeById } from "./findRecipe";
import { fetchRecipeById } from "./api";

/**
 * useRecipe(id) — the ONLY source of truth for "load a recipe by ID" in
 * the app. Replaces the fragile pattern of digging through context + 5
 * localStorage caches ad-hoc in every page.
 *
 * Resolution order:
 *   1. Context recipes / favorites (instant)
 *   2. localStorage caches: recent → wcie_recipes → manifeast_favorites → inspire pools (instant)
 *   3. Backend GET /api/recipe/<id> (one network hop, 45-day TTL on server)
 *
 * Returns { recipe, loading, error, retry }:
 *   - `recipe` is null until resolved
 *   - `loading` is true while the network fetch is in-flight (never on local hits)
 *   - `error` is a short message string if the network also failed
 *   - `retry()` re-runs the network fetch (same id)
 */
export function useRecipe(id) {
  const { recipes, favorites, rememberRecipe } = useApp();

  // Synchronous local lookup first — covers 99% of cases with zero network.
  const localRecipe = useMemo(
    () => findRecipeById(id, { contextRecipes: recipes, contextFavorites: favorites }),
    [id, recipes, favorites],
  );

  const [fetchedRecipe, setFetchedRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  // Network fallback. Only runs when all local caches miss.
  useEffect(() => {
    if (!id) return;
    if (localRecipe) {
      // Clear any stale fetched state if we've found it locally now.
      setFetchedRecipe(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRecipeById(id)
      .then((data) => {
        if (cancelled) return;
        setFetchedRecipe(data);
        // Promote to the durable "recent" cache so other screens find
        // it too, and the next visit doesn't hit the network.
        try { rememberRecipe(data); } catch { /* ignore */ }
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(status === 404 ? "Recipe not found." : "Couldn't load this recipe.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, localRecipe, retryTick, rememberRecipe]);

  return {
    recipe: localRecipe || fetchedRecipe,
    loading,
    error,
    retry,
  };
}

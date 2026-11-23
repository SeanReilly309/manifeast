import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Sun, Sandwich, UtensilsCrossed, Cookie, Apple } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { RecipeCardSkeleton } from "../components/RecipeCardSkeleton";
import { inspireMeals } from "../lib/api";
import { useApp } from "../context/AppContext";
import { isCompleteRecipe } from "../lib/recipeComplete";

const CATEGORIES = [
  { id: "breakfast", label: "Breakfast", icon: Sun },
  { id: "lunch", label: "Lunch", icon: Sandwich },
  { id: "dinner", label: "Dinner", icon: UtensilsCrossed },
  { id: "snack", label: "Snacks", icon: Apple },
  { id: "dessert", label: "Desserts", icon: Cookie },
];

// A single tab loads a POOL of recipes once; the Shuffle button rotates
// through this pool in windows of PAGE_SIZE (0ms, no network). Once we've
// cycled through the whole pool, we silently refill it in the background so
// the next full cycle also feels instant.
const POOL_SIZE = 12;
const PAGE_SIZE = 3;

const LS_INSPIRE_CACHE = "manifeast_inspire_cache_v3";

// Drop older on-device pools so we never serve a half-formed recipe after an update.
(function purgeLegacyInspireCaches() {
  try {
    localStorage.removeItem("manifeast_inspire_cache");
    localStorage.removeItem("manifeast_inspire_cache_v2");
    localStorage.removeItem("manifeast_recent_recipes");
  } catch { /* ignore */ }
})();

const onlyComplete = (list) => (Array.isArray(list) ? list.filter(isCompleteRecipe) : []);

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_INSPIRE_CACHE) || "{}");
    const out = {};
    for (const cat of Object.keys(raw)) out[cat] = onlyComplete(raw[cat]);
    return out;
  } catch {
    return {};
  }
}

function writeCache(next) {
  try {
    localStorage.setItem(LS_INSPIRE_CACHE, JSON.stringify(next));
  } catch { /* ignore */ }
}

export default function InspireMe() {
  const { setRecipes, rememberRecipe, rememberRecipes } = useApp();
  const [category, setCategory] = useState("breakfast");
  const [loading, setLoading] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [byCategory, setByCategory] = useState(() => readCache());
  // Per-category cursor into the pool. Shuffle advances by PAGE_SIZE (wraps).
  const [cursors, setCursors] = useState({});
  const navigate = useNavigate();

  const pool = useMemo(() => byCategory[category] || [], [byCategory, category]);
  const cursor = cursors[category] || 0;

  // The window of PAGE_SIZE cards currently shown from the pool. If the pool
  // is smaller than PAGE_SIZE we just show whatever we have.
  const results = useMemo(() => {
    if (pool.length === 0) return [];
    if (pool.length <= PAGE_SIZE) return pool;
    return Array.from(
      { length: PAGE_SIZE },
      (_, i) => pool[(cursor + i) % pool.length],
    );
  }, [pool, cursor]);

  const [error, setError] = useState(null);

  const [debugLog, setDebugLog] = useState([]);

  // Recipe generation is LLM-backed and can take 20-40s. iOS Capacitor / WKWebView
  // can drop a slow request as "network error" mid-flight. Retry once with a brief
  // pause so a single dropped fetch doesn't fail the user.
  const attemptWithRetry = useCallback(async (fn) => {
    const start = Date.now();
    try {
      const r = await fn();
      setDebugLog((prev) => [
        `[${new Date().toLocaleTimeString()}] OK in ${Date.now() - start}ms`,
        ...prev,
      ].slice(0, 8));
      return r;
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      const status = err?.response?.status;
      const errText = `${status || "no-status"} · ${err?.message || "?"} · code=${err?.code || "?"}`;
      setDebugLog((prev) => [
        `[${new Date().toLocaleTimeString()}] 1st fail (${Date.now() - start}ms): ${errText}`,
        ...prev,
      ].slice(0, 8));
      const isTransient =
        !status ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        msg.includes("network") ||
        msg.includes("timeout");
      if (!isTransient) throw err;
      await new Promise((r) => setTimeout(r, 2500));
      const retryStart = Date.now();
      try {
        const r = await fn();
        setDebugLog((prev) => [
          `[${new Date().toLocaleTimeString()}] retry OK in ${Date.now() - retryStart}ms`,
          ...prev,
        ].slice(0, 8));
        return r;
      } catch (err2) {
        const errText2 = `${err2?.response?.status || "no-status"} · ${err2?.message || "?"} · code=${err2?.code || "?"}`;
        setDebugLog((prev) => [
          `[${new Date().toLocaleTimeString()}] retry fail (${Date.now() - retryStart}ms): ${errText2}`,
          ...prev,
        ].slice(0, 8));
        throw err2;
      }
    }
  }, []);

  const friendlyError = (e, fallback) => {
    const detail = e?.response?.data?.detail;
    if (detail) return detail;
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("network") || msg.includes("timeout")) {
      return "Slow connection — the AI takes a few seconds. Please tap again.";
    }
    return e?.message || fallback;
  };

  const load = useCallback(async (cat, { force = false } = {}) => {
    if (!force && (byCategory[cat] || []).length >= PAGE_SIZE) return;
    setLoading(true);
    setError(null);
    try {
      const data = await attemptWithRetry(() => inspireMeals(cat, null, POOL_SIZE, [], force));
      const freshRecipes = onlyComplete(data.recipes);
      const next = { ...byCategory, [cat]: freshRecipes };
      setByCategory(next);
      writeCache(next);
      // Durable per-recipe cache so Cook Mode can always resolve any card
      // the user might tap, even after the pool later gets refilled.
      rememberRecipes(freshRecipes);
      setCursors((prev) => ({ ...prev, [cat]: 0 }));
    } catch (e) {
      const status = e?.response?.status;
      const msg = friendlyError(e, "Couldn't fetch ideas");
      setError({ status, msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [byCategory, attemptWithRetry, rememberRecipes]);

  // Silently refill this category's pool with 12 fresh recipes (deduped
  // against what's already on-screen). Runs in the background so the user
  // never sees a spinner.
  const refillPool = useCallback(async (cat) => {
    if (refilling) return;
    setRefilling(true);
    try {
      const data = await inspireMeals(cat, null, POOL_SIZE, [], true);
      const fresh = onlyComplete(data.recipes);
      if (fresh.length === 0) return;
      rememberRecipes(fresh);
      setByCategory((prev) => {
        const existing = prev[cat] || [];
        const existingTitles = new Set(existing.map((r) => (r.title || "").toLowerCase()));
        const brandNew = fresh.filter((r) => !existingTitles.has((r.title || "").toLowerCase()));
        // Prefer brand-new recipes but keep some previous ones so the pool is
        // always POOL_SIZE, avoiding a jarring drop in variety.
        const combined = [...brandNew, ...existing].slice(0, POOL_SIZE);
        const next = { ...prev, [cat]: combined };
        writeCache(next);
        return next;
      });
    } catch {
      // Silent — best-effort.
    } finally {
      setRefilling(false);
    }
  }, [refilling, rememberRecipes]);

  // Background prefetch of the other categories after the current one loads.
  // Server-side cache means these are cheap for everyone else too.
  const prefetchOthers = useCallback(async (activeCat) => {
    const others = CATEGORIES.map((c) => c.id).filter(
      (c) => c !== activeCat && (byCategory[c] || []).length === 0,
    );
    // Fire all category prefetches in parallel — the backend caches them for 4h
    // so subsequent tab switches are effectively instant.
    const results = await Promise.allSettled(
      others.map((cat) => inspireMeals(cat, null, POOL_SIZE, [], false).then((d) => [cat, onlyComplete(d.recipes)])),
    );
    const additions = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        const [cat, recipes] = r.value;
        additions[cat] = recipes;
      }
    }
    if (Object.keys(additions).length > 0) {
      // Pre-cache every prefetched recipe so tab-switching into them and
      // then tapping Start Cooking always resolves.
      const flat = [];
      for (const list of Object.values(additions)) flat.push(...list);
      rememberRecipes(flat);
      setByCategory((prev) => {
        const next = { ...prev, ...additions };
        writeCache(next);
        return next;
      });
    }
  }, [byCategory, rememberRecipes]);

  useEffect(() => {
    // Clean up legacy keys from the removed diet-filter feature.
    try { localStorage.removeItem("manifeast_inspire_diets"); } catch { /* ignore */ }
    load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // After the current category has results and no in-flight load, prefetch the rest
  // so switching tabs is instant.
  useEffect(() => {
    if (loading) return;
    if (!(byCategory[category] || []).length) return;
    const timer = setTimeout(() => {
      prefetchOthers(category);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, loading, byCategory[category]?.length]);

  const handleOpen = (recipe) => {
    rememberRecipe(recipe);
    setRecipes(results);
    navigate(`/recipe/${recipe.id}`);
  };

  const shuffle = useCallback(() => {
    // If we don't yet have a full pool (e.g. cold offline start), fall back
    // to a visible reload so the user sees fresh cards.
    if (pool.length < PAGE_SIZE * 2) {
      load(category, { force: true });
      return;
    }
    const nextCursor = (cursor + PAGE_SIZE) % pool.length;
    setCursors((prev) => ({ ...prev, [category]: nextCursor }));
    // When we've completed a full cycle through the pool, silently refill it
    // so the next cycle is a fresh set of ideas — user sees no delay.
    if (nextCursor < PAGE_SIZE) {
      refillPool(category);
    }
  }, [pool.length, cursor, category, load, refillPool]);

  return (
    <div className="space-y-8" data-testid="inspire-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Inspire me
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          Not sure what to <span className="italic text-brand-primary">cook?</span>
        </h1>
        <p className="text-brand-text-soft max-w-xl">
          Pick a meal &mdash; we&rsquo;ll toss you a fresh handful of ideas from quick classics
          to something you&rsquo;ve never tried.
        </p>
      </div>

      {/* Category tabs */}
      <div className="-mx-5 md:mx-0">
        <div
          data-testid="inspire-tabs"
          className="flex gap-2 overflow-x-auto no-scrollbar px-5 md:px-0 pb-1"
        >
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.id === category;
            return (
              <button
                key={c.id}
                data-testid={`inspire-tab-${c.id}`}
                onClick={() => setCategory(c.id)}
                className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors ${
                  active
                    ? "bg-brand-primary text-white border-brand-primary shadow-[0_6px_18px_rgba(224,122,95,0.28)]"
                    : "bg-white text-brand-text-soft border-brand-line hover:text-brand-text"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.7} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-text-soft">
          {loading
            ? "Cooking up ideas…"
            : `${pool.length} ${category} ideas`}
        </p>
        <Button
          data-testid="inspire-shuffle-btn"
          variant="outline"
          disabled={loading}
          onClick={shuffle}
          className="rounded-full h-10 px-4 text-sm font-semibold border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.7} />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.7} />
          )}
          Shuffle
        </Button>
      </div>

      {loading && results.length === 0 && (
        <div
          data-testid="inspire-loading"
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && results.length === 0 && error && (
        <div
          data-testid="inspire-error"
          className="rounded-3xl bg-white border border-brand-line px-6 py-14 text-center space-y-4"
        >
          <p className="font-serif-display text-3xl italic text-brand-text">
            {error.status === 503 ? "The kitchen is closed for a sec." : "Couldn't fetch ideas."}
          </p>
          <p className="text-brand-text-soft max-w-md mx-auto text-sm">
            {error.msg}
          </p>
          <Button
            data-testid="inspire-retry-btn"
            onClick={shuffle}
            className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white px-6"
          >
            <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.7} />
            Try again
          </Button>
          {debugLog.length > 0 && (
            <div className="mt-4 text-left bg-black/90 text-green-400 rounded-2xl p-4 text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
              <p className="text-white/60 mb-1">DEBUG (screenshot this for the dev):</p>
              {debugLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <p className="text-white/60 mt-2">
                API: {process.env.REACT_APP_BACKEND_URL || "(unset)"}
              </p>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div
          data-testid="inspire-grid"
          className={`grid md:grid-cols-2 lg:grid-cols-3 gap-6 ${loading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {results.map((r, i) => (
            <RecipeCard key={r.id || r.title || i} recipe={r} index={i} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Plus, Sun, Sandwich, UtensilsCrossed, Cookie, Apple } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { RecipeCardSkeleton } from "../components/RecipeCardSkeleton";
import { inspireMeals } from "../lib/api";
import { useApp } from "../context/AppContext";

const CATEGORIES = [
  { id: "breakfast", label: "Breakfast", icon: Sun },
  { id: "lunch", label: "Lunch", icon: Sandwich },
  { id: "dinner", label: "Dinner", icon: UtensilsCrossed },
  { id: "snack", label: "Snacks", icon: Apple },
  { id: "dessert", label: "Desserts", icon: Cookie },
];

const LS_INSPIRE_CACHE = "manifeast_inspire_cache";

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(LS_INSPIRE_CACHE) || "{}");
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
  const { setRecipes } = useApp();
  const [category, setCategory] = useState("breakfast");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [byCategory, setByCategory] = useState(() => readCache());
  const navigate = useNavigate();

  const results = byCategory[category] || [];
  const [error, setError] = useState(null);

  // Recipe generation is LLM-backed and can take 20-40s. iOS Capacitor / WKWebView
  // can drop a slow request as "network error" mid-flight. Retry once with a brief
  // pause so a single dropped fetch doesn't fail the user.
  const attemptWithRetry = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      const status = err?.response?.status;
      const isTransient =
        !status ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        msg.includes("network") ||
        msg.includes("timeout");
      if (!isTransient) throw err;
      await new Promise((r) => setTimeout(r, 1000));
      return await fn();
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
    if (!force && (byCategory[cat] || []).length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await attemptWithRetry(() => inspireMeals(cat, null, 3, [], force));
      const next = { ...byCategory, [cat]: data.recipes || [] };
      setByCategory(next);
      writeCache(next);
    } catch (e) {
      const status = e?.response?.status;
      const msg = friendlyError(e, "Couldn't fetch ideas");
      setError({ status, msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [byCategory, attemptWithRetry]);

  // Load 4 MORE ideas and append to the current list. Bypasses cache so we
  // always get fresh ideas (deduped against what's already shown).
  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await attemptWithRetry(() => inspireMeals(category, null, 3, [], true));
      const fresh = data.recipes || [];
      const existingIds = new Set((byCategory[category] || []).map((r) => r.id));
      const existingTitles = new Set(
        (byCategory[category] || []).map((r) => (r.title || "").toLowerCase())
      );
      const deduped = fresh.filter(
        (r) => !existingIds.has(r.id) && !existingTitles.has((r.title || "").toLowerCase())
      );
      setByCategory((prev) => {
        const combined = [...(prev[category] || []), ...deduped];
        const next = { ...prev, [category]: combined };
        writeCache(next);
        return next;
      });
      if (deduped.length === 0) {
        toast.info("No new ideas this time — try Shuffle instead.");
      }
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't load more"));
    } finally {
      setLoadingMore(false);
    }
  }, [category, byCategory, loading, loadingMore, attemptWithRetry]);

  // Background prefetch of the other categories after the current one loads.
  // Server-side cache means these are cheap for everyone else too.
  const prefetchOthers = useCallback(async (activeCat) => {
    const others = CATEGORIES.map((c) => c.id).filter((c) => c !== activeCat);
    for (const cat of others) {
      if ((byCategory[cat] || []).length > 0) continue;
      try {
        const data = await inspireMeals(cat, null, 3, [], false);
        setByCategory((prev) => {
          const next = { ...prev, [cat]: data.recipes || [] };
          writeCache(next);
          return next;
        });
      } catch {
        // Silent — prefetch is best-effort.
        break;
      }
    }
  }, [byCategory]);

  useEffect(() => {
    // Clean up legacy keys from the removed diet-filter feature.
    try { localStorage.removeItem("manifeast_inspire_diets"); } catch { /* ignore */ }
    load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // After the current category has results and no in-flight load, prefetch the rest.
  useEffect(() => {
    if (loading) return;
    if (!(byCategory[category] || []).length) return;
    const timer = setTimeout(() => prefetchOthers(category), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, loading, byCategory[category]?.length]);

  const handleOpen = (recipe) => {
    setRecipes(results);
    navigate(`/recipe/${recipe.id}`);
  };

  const shuffle = () => load(category, { force: true });

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
            : `${results.length} ${category} ideas`}
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
        </div>
      )}

      {results.length > 0 && (
        <>
          <div
            data-testid="inspire-grid"
            className={`grid md:grid-cols-2 lg:grid-cols-3 gap-6 ${loading ? "opacity-50 pointer-events-none" : ""}`}
          >
            {results.map((r, i) => (
              <RecipeCard key={r.id || r.title || i} recipe={r} index={i} onOpen={handleOpen} />
            ))}
            {loadingMore &&
              Array.from({ length: 4 }).map((_, i) => (
                <RecipeCardSkeleton key={`more-${i}`} />
              ))}
          </div>

          <div className="flex justify-center pt-2">
            <Button
              data-testid="inspire-load-more-btn"
              variant="outline"
              disabled={loading || loadingMore}
              onClick={loadMore}
              className="rounded-full h-12 px-6 text-sm font-semibold border-brand-primary/30 text-brand-primary bg-white hover:bg-brand-primary/5 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.7} />
              ) : (
                <Plus className="w-4 h-4 mr-2" strokeWidth={2.2} />
              )}
              {loadingMore ? "Fetching more ideas…" : "Load 3 more ideas"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

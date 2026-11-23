import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { RecipeCardSkeleton } from "../components/RecipeCardSkeleton";
import { askIdeas, askRecipes } from "../lib/api";
import { useApp } from "../context/AppContext";
import { isCompleteRecipe } from "../lib/recipeComplete";

const VARIANTS = 3;

const SUGGESTIONS = [
  "chocolate chip cookies",
  "chicken curry",
  "banana bread",
  "pasta carbonara",
  "healthy breakfast",
  "protein pancakes",
];

export default function Ask() {
  const { setRecipes, rememberRecipe, rememberRecipes } = useApp();
  const [query, setQuery] = useState("");
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const loading = busy;
  const results = slots.filter((s) => s.ready).map((s) => s.recipe);
  const [lastQuery, setLastQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const searchIdRef = useRef(0);

  useEffect(() => {
    if (results.length > 0) setRecipes(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // Phase 1: quick ideas (~2-3s) so cards show almost instantly.
  // Phase 2: each card's full recipe is written in parallel; a card only
  // opens once its complete recipe has arrived.
  const search = useCallback(async (q) => {
    const clean = (q || "").trim();
    if (!clean || busy) return;
    const searchId = ++searchIdRef.current;
    const stale = () => searchIdRef.current !== searchId;
    setSlots([]);
    setLastQuery(clean);
    setBusy(true);
    // Keep the query in the URL so Back from a recipe re-shows results (cached server-side).
    if (new URLSearchParams(location.search).get("q") !== clean) {
      navigate(`/ask?q=${encodeURIComponent(clean)}`, { replace: true });
    }

    const isTransient = (err) => {
      const status = err?.response?.status;
      const msg = String(err?.message || "").toLowerCase();
      return !status || [502, 503, 504].includes(status) || msg.includes("network") || msg.includes("timeout");
    };
    const withRetry = async (fn) => {
      try {
        return await fn();
      } catch (err) {
        if (!isTransient(err)) throw err;
        await new Promise((r) => setTimeout(r, 800));
        return fn();
      }
    };
    const removeSlot = (key) => setSlots((prev) => prev.filter((s) => s.key !== key));

    let failures = 0;
    let lastError = null;
    try {
      let ideas = [];
      try {
        ideas = (await withRetry(() => askIdeas(clean))).ideas || [];
      } catch (e) {
        lastError = e;
      }
      if (stale()) return;
      const jobs = ideas.length
        ? ideas.map((idea) => ({ key: idea.id, idea, run: () => askRecipes(clean, 1, null, idea.id) }))
        : Array.from({ length: VARIANTS }, (_, v) => ({ key: `v${v}`, idea: null, run: () => askRecipes(clean, 1, v) }));
      setSlots(jobs.filter((j) => j.idea).map((j) => ({ key: j.key, recipe: j.idea, ready: false })));

      await Promise.all(
        jobs.map((j) =>
          withRetry(j.run)
            .then((data) => {
              if (stale()) return;
              const rec = (data.recipes || []).find(isCompleteRecipe);
              if (!rec) return removeSlot(j.key);
              rememberRecipes([rec]);
              setSlots((prev) => {
                if (prev.some((s) => s.key === j.key)) {
                  return prev.map((s) => (s.key === j.key ? { key: j.key, recipe: rec, ready: true } : s));
                }
                if (prev.some((s) => s.recipe.id === rec.id)) return prev;
                return [...prev, { key: j.key, recipe: rec, ready: true }];
              });
            })
            .catch((e) => {
              failures += 1;
              lastError = e;
              if (!stale()) removeSlot(j.key);
            }),
        ),
      );
      if (!stale() && failures === jobs.length) {
        const e = lastError;
        const detail =
          e?.response?.data?.detail ||
          (e?.message?.toLowerCase().includes("network")
            ? "Recipe generation timed out. Please try again — the AI can be slow."
            : e?.message) ||
          "Search failed";
        toast.error(detail);
      }
    } finally {
      if (!stale()) setBusy(false);
    }
  }, [busy, rememberRecipes, location.search, navigate]);

  // Auto-run search if URL has ?q=
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) {
      setQuery(q);
      search(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleOpen = (recipe) => {
    if (!isCompleteRecipe(recipe)) {
      toast("Still writing this recipe — just a few more seconds.");
      return;
    }
    rememberRecipe(recipe);
    navigate(`/recipe/${recipe.id}`);
  };

  return (
    <div className="space-y-8" data-testid="ask-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Ask
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          What do you feel like <span className="italic text-brand-primary">making?</span>
        </h1>
        <p className="text-brand-text-soft max-w-xl">
          Type a dish, cuisine, or craving &mdash; we&rsquo;ll show you a handful of variations
          from classic to creative.
        </p>
      </div>

      <div className="bg-white border border-brand-line rounded-3xl p-4 md:p-5 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-soft" strokeWidth={1.8} />
            <Input
              data-testid="ask-input"
              value={query}
              placeholder="e.g. cookies, ramen, salmon dinner…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(query); } }}
              className="h-14 pl-11 pr-4 text-base rounded-2xl border-brand-line bg-brand-bg focus-visible:ring-brand-primary/40"
            />
          </div>
          <Button
            data-testid="ask-btn"
            disabled={!query.trim() || loading}
            onClick={() => search(query)}
            className="rounded-2xl h-14 px-5 md:px-6 font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.7} /> : <Sparkles className="w-5 h-5" strokeWidth={1.7} />}
          </Button>
        </div>
        {results.length === 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-xs text-brand-text-soft mr-1 py-1.5">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                data-testid={`suggestion-${s}`}
                onClick={() => { setQuery(s); search(s); }}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-bg text-brand-text-soft hover:bg-brand-line/60 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {(loading || results.length > 0) && (
        <div className="space-y-6" data-testid="ask-results">
          <div>
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary mb-1" data-testid="ask-results-count">
              {loading ? (
                <span className="inline-flex items-center gap-1.5" data-testid="ask-loading">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                  {slots.length === 0 ? "Finding recipes…" : `${results.length} of ${slots.length} ready · writing recipes`}
                </span>
              ) : (
                `${results.length} takes on`
              )}
            </p>
            <h2 className="font-serif-display text-3xl font-medium text-brand-text lowercase">
              {lastQuery}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {slots.map((s, i) => (
              <RecipeCard key={s.key} recipe={s.recipe} index={i} onOpen={handleOpen} writing={!s.ready} />
            ))}
            {busy && Array.from({ length: Math.max(0, VARIANTS - slots.length) }, (_, i) => (
              <RecipeCardSkeleton key={`sk-${i}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

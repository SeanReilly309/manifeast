import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { RecipeCardSkeleton } from "../components/RecipeCardSkeleton";
import { askRecipes } from "../lib/api";
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
  const [pending, setPending] = useState(0);
  const loading = pending > 0;
  const [results, setResults] = useState([]);
  const [lastQuery, setLastQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const searchIdRef = useRef(0);

  // One request per variant fired in parallel; each card appears the moment
  // its recipe is ready instead of waiting for all three.
  const search = useCallback(async (q) => {
    const clean = (q || "").trim();
    if (!clean || pending > 0) return;
    const searchId = ++searchIdRef.current;
    setResults([]);
    setLastQuery(clean);
    setPending(VARIANTS);

    const isTransient = (err) => {
      const status = err?.response?.status;
      const msg = String(err?.message || "").toLowerCase();
      return !status || [502, 503, 504].includes(status) || msg.includes("network") || msg.includes("timeout");
    };
    const fetchVariant = async (v) => {
      try {
        return await askRecipes(clean, 1, v);
      } catch (err) {
        if (!isTransient(err)) throw err;
        await new Promise((r) => setTimeout(r, 800));
        return askRecipes(clean, 1, v);
      }
    };

    let failures = 0;
    let lastError = null;
    await Promise.all(
      Array.from({ length: VARIANTS }, (_, v) =>
        fetchVariant(v)
          .then((data) => {
            if (searchIdRef.current !== searchId) return;
            const incoming = (data.recipes || []).filter(isCompleteRecipe);
            if (incoming.length === 0) return;
            rememberRecipes(incoming);
            setResults((prev) => {
              const titles = new Set(prev.map((r) => (r.title || "").toLowerCase()));
              const next = [...prev, ...incoming.filter((r) => !titles.has((r.title || "").toLowerCase()))];
              setRecipes(next);
              return next;
            });
          })
          .catch((e) => {
            failures += 1;
            lastError = e;
          })
          .finally(() => {
            if (searchIdRef.current === searchId) setPending((p) => Math.max(0, p - 1));
          }),
      ),
    );
    if (searchIdRef.current === searchId && failures === VARIANTS) {
      const e = lastError;
      const detail =
        e?.response?.data?.detail ||
        (e?.message?.toLowerCase().includes("network")
          ? "Recipe generation timed out. Please try again — the AI can be slow."
          : e?.message) ||
        "Search failed";
      toast.error(detail);
    }
  }, [pending, setRecipes, rememberRecipes]);

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
                  {results.length === 0 ? "Cooking up recipes…" : `${results.length} ready · more on the way`}
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
            {results.map((r, i) => (
              <RecipeCard key={r.id || r.title || i} recipe={r} index={i} onOpen={handleOpen} />
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <RecipeCardSkeleton key={`sk-${i}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

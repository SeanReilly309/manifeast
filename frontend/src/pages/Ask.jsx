import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { askRecipes } from "../lib/api";
import { useApp } from "../context/AppContext";

const SUGGESTIONS = [
  "chocolate chip cookies",
  "chicken curry",
  "banana bread",
  "pasta carbonara",
  "healthy breakfast",
  "protein pancakes",
];

export default function Ask() {
  const { setRecipes } = useApp();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [lastQuery, setLastQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const search = useCallback(async (q) => {
    const clean = (q || "").trim();
    if (!clean) return;
    setLoading(true);
    // Recipe generation can take 30-60s on the LLM. Retry once on transient
    // network / timeout errors so a single dropped connection doesn't fail the user.
    const attemptOnce = () => askRecipes(clean, 4);
    try {
      let data;
      try {
        data = await attemptOnce();
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
        // brief pause then retry once
        await new Promise((r) => setTimeout(r, 800));
        data = await attemptOnce();
      }
      setResults(data.recipes || []);
      setLastQuery(clean);
      setRecipes(data.recipes || []);
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        (e?.message?.toLowerCase().includes("network")
          ? "Recipe generation timed out. Please try again — the AI can be slow."
          : e?.message) ||
        "Search failed";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  }, [setRecipes]);

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

  const handleOpen = (recipe) => navigate(`/recipe/${recipe.id}`);

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

      {loading && (
        <div className="text-center py-16 space-y-3" data-testid="ask-loading">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-primary" strokeWidth={1.5} />
          <p className="font-serif-display text-2xl italic text-brand-text-soft">Cooking up variations…</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary mb-1">
                {results.length} takes on
              </p>
              <h2 className="font-serif-display text-3xl font-medium text-brand-text lowercase">
                {lastQuery}
              </h2>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((r, i) => (
              <RecipeCard key={r.id || r.title || i} recipe={r} index={i} onOpen={handleOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

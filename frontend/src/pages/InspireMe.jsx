import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Sparkles, Sun, Sandwich, UtensilsCrossed, Cookie, Apple, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { RecipeCard } from "../components/RecipeCard";
import { inspireMeals } from "../lib/api";
import { useApp } from "../context/AppContext";

const CATEGORIES = [
  { id: "breakfast", label: "Breakfast", icon: Sun },
  { id: "lunch", label: "Lunch", icon: Sandwich },
  { id: "dinner", label: "Dinner", icon: UtensilsCrossed },
  { id: "snack", label: "Snacks", icon: Apple },
  { id: "dessert", label: "Desserts", icon: Cookie },
];

const DIETS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten_free", label: "Gluten-free" },
  { id: "low_carb", label: "Low-carb" },
  { id: "dairy_free", label: "Dairy-free" },
];

const LS_COACH_PROFILE = "manifeast_coach_profile";
const LS_INSPIRE_CACHE = "manifeast_inspire_cache";
const LS_INSPIRE_DIETS = "manifeast_inspire_diets";

function readCoachHint() {
  try {
    const raw = localStorage.getItem(LS_COACH_PROFILE);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const age = parseInt(p.age, 10) || 0;
    const h = parseFloat(p.height_cm) || 0;
    const w = parseFloat(p.weight_kg) || 0;
    if (!age || !h || !w) return { goal: p.goal || null };
    const bmr =
      p.sex === "female"
        ? 10 * w + 6.25 * h - 5 * age - 161
        : 10 * w + 6.25 * h - 5 * age + 5;
    const days = Math.max(0, Math.min(7, parseInt(p.exerciseDays, 10) || 0));
    const intensityKcal = { easy: 200, moderate: 370, hard: 550 }[p.exerciseIntensity] || 370;
    const typeMult = { walking: 0.7, cardio: 1.15, weights: 0.9, mixed: 1.0, sports: 1.05 }[p.exerciseType] || 1.0;
    const tdee = bmr * 1.2 + (days * intensityKcal * typeMult) / 7;
    const delta = { lose: -500, maintain: 0, gain: 350 }[p.goal] ?? 0;
    return {
      target_kcal: Math.max(1200, Math.round(tdee + delta)),
      protein_g: Math.round(w * 1.8),
      goal: p.goal || "maintain",
    };
  } catch {
    return null;
  }
}

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
  const [byKey, setByKey] = useState(() => readCache());
  const [coachOn, setCoachOn] = useState(false);
  const [diets, setDiets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_INSPIRE_DIETS) || "[]"); }
    catch { return []; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.setItem(LS_INSPIRE_DIETS, JSON.stringify(diets)); }
    catch { /* ignore */ }
  }, [diets]);

  const cacheKey = `${category}|${[...diets].sort().join(",")}`;
  const results = byKey[cacheKey] || [];

  const load = useCallback(async (cat, dietList, { force = false } = {}) => {
    const key = `${cat}|${[...dietList].sort().join(",")}`;
    if (!force && (byKey[key] || []).length > 0) return;
    setLoading(true);
    try {
      const coach = readCoachHint();
      setCoachOn(!!coach?.target_kcal);
      const data = await inspireMeals(cat, coach, 8, dietList);
      const next = { ...byKey, [key]: data.recipes || [] };
      setByKey(next);
      writeCache(next);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Couldn't fetch ideas");
    } finally {
      setLoading(false);
    }
  }, [byKey]);

  useEffect(() => {
    load(category, diets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, diets]);

  const handleOpen = (i) => {
    setRecipes(results);
    navigate(`/recipe/${i}`);
  };

  const shuffle = () => load(category, diets, { force: true });

  const toggleDiet = (id) => {
    setDiets((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const clearDiets = () => setDiets([]);

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
          {coachOn && (
            <span className="block mt-1 text-sm text-brand-secondary-dark">
              <Sparkles className="w-3.5 h-3.5 inline mb-0.5" strokeWidth={2} /> Personalized using your Coach targets.
            </span>
          )}
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

      {/* Diet filters */}
      <div className="-mx-5 md:mx-0">
        <div
          data-testid="inspire-diets"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar px-5 md:px-0 pb-1"
        >
          <span className="text-xs tracking-[0.18em] uppercase font-semibold text-brand-text-soft pr-1 flex-shrink-0">
            Diet
          </span>
          {DIETS.map((d) => {
            const active = diets.includes(d.id);
            return (
              <button
                key={d.id}
                data-testid={`diet-${d.id}`}
                onClick={() => toggleDiet(d.id)}
                aria-pressed={active}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-brand-secondary text-white border-brand-secondary shadow-[0_4px_12px_rgba(129,178,154,0.35)]"
                    : "bg-white text-brand-text-soft border-brand-line hover:text-brand-text"
                }`}
              >
                {d.label}
              </button>
            );
          })}
          {diets.length > 0 && (
            <button
              data-testid="diet-clear"
              onClick={clearDiets}
              className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-brand-text-soft hover:text-brand-primary"
            >
              <X className="w-3 h-3" strokeWidth={2.2} /> clear
            </button>
          )}
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
        <div className="text-center py-16 space-y-3" data-testid="inspire-loading">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-primary" strokeWidth={1.5} />
          <p className="font-serif-display text-2xl italic text-brand-text-soft">
            Dreaming up {category} ideas…
          </p>
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

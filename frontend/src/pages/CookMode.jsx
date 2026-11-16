import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  ListOrdered,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";
import { findRecipeById } from "../lib/findRecipe";
import { recipeImage } from "../lib/recipeImage";
import {
  extractDuration,
  formatTimerClock,
  ingredientsForStep,
} from "../lib/cookStep";
import { askRecipes } from "../lib/api";
import { toast } from "sonner";

// If the LLM somehow returns a recipe with 0 instructions (our backend
// filter normally stops this), construct a sensible generic step list from
// the ingredient list so Cook Mode still has something to show. The user
// can tap Retry to fetch a proper AI-generated version.
function fallbackSteps(recipe) {
  const ings = Array.isArray(recipe?.ingredients_detailed)
    ? recipe.ingredients_detailed
    : [];
  if (ings.length === 0) return [];
  const list = ings
    .map((i) => (typeof i === "string" ? i : i?.name || ""))
    .filter(Boolean);
  return [
    `Gather and measure: ${list.slice(0, 6).join(", ")}${list.length > 6 ? ` and ${list.length - 6} more` : ""}.`,
    "Prep your ingredients: chop, slice, or measure them out so they're ready to go.",
    "Combine the ingredients in the order and manner typical for this dish.",
    "Cook on medium heat until the dish is done and the aromas are developed.",
    "Taste, adjust seasoning, and serve.",
  ];
}

export default function CookMode() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { recipes, favorites, setRecipes } = useApp();

  // Search every cache in the app for the recipe. This fixes the old
  // "No recipe to cook" bug where CookMode could only see AppContext state.
  const recipe = useMemo(
    () => findRecipeById(id, { contextRecipes: recipes, contextFavorites: favorites }),
    [id, recipes, favorites],
  );

  const [refetching, setRefetching] = useState(false);

  const steps = useMemo(() => {
    const direct = Array.isArray(recipe?.instructions) ? recipe.instructions : [];
    return direct.length > 0 ? direct : fallbackSteps(recipe);
  }, [recipe]);

  const [step, setStep] = useState(0);
  // Keep step in range if the recipe/instructions change mid-session.
  useEffect(() => { setStep(0); }, [recipe?.id]);

  const total = steps.length;
  const currentStep = steps[step] || "";
  const progress = total > 0 ? ((step + 1) / total) * 100 : 0;
  const isLast = step === total - 1;

  // --- Per-step timer (auto-detected from the step text) -------------------
  const duration = useMemo(() => extractDuration(currentStep), [currentStep]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [remaining, setRemaining] = useState(duration?.seconds ?? 0);
  const intervalRef = useRef(null);

  // Reset the timer whenever we move to a new step.
  useEffect(() => {
    setTimerRunning(false);
    setRemaining(duration?.seconds ?? 0);
  }, [step, duration?.seconds]);

  useEffect(() => {
    if (!timerRunning) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          setTimerRunning(false);
          toast.success(`Timer done — step ${step + 1} is ready.`);
          // Best-effort vibration on mobile.
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate([200, 80, 200]); } catch { /* ignore */ }
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timerRunning, step]);

  const toggleTimer = () => setTimerRunning((v) => !v);
  const resetTimer = () => {
    setTimerRunning(false);
    setRemaining(duration?.seconds ?? 0);
  };

  // --- Navigation ---------------------------------------------------------
  const next = useCallback(() => setStep((s) => Math.min(s + 1, total - 1)), [total]);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const exit = useCallback(() => {
    if (recipe) navigate(`/recipe/${recipe.id}`);
    else navigate(-1);
  }, [navigate, recipe]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, exit]);

  // --- Retry: fetch a fresh copy of the recipe (title lookup) -------------
  const refetchRecipe = useCallback(async () => {
    if (!recipe?.title) {
      toast.error("No recipe title to search with.");
      return;
    }
    setRefetching(true);
    try {
      const data = await askRecipes(recipe.title, 1);
      const fresh = (data.recipes || [])[0];
      if (!fresh) throw new Error("no result");
      // Swap the old id's entry in context so navigation back still works.
      const next = (recipes || []).map((r) => (r.id === recipe.id ? { ...fresh, id: recipe.id } : r));
      // If the old recipe wasn't in context, prepend the new one so
      // findRecipeById picks it up next render.
      const hasIt = next.some((r) => r.id === recipe.id);
      setRecipes(hasIt ? next : [{ ...fresh, id: recipe.id }, ...next]);
      toast.success("Recipe reloaded.");
    } catch {
      toast.error("Couldn't load this recipe. Try again.");
    } finally {
      setRefetching(false);
    }
  }, [recipe, recipes, setRecipes]);

  // --- Error state -------------------------------------------------------
  if (!recipe) {
    return (
      <div
        className="min-h-[60vh] grid place-items-center px-6"
        data-testid="cook-error"
      >
        <div className="max-w-sm w-full text-center space-y-5 bg-white rounded-3xl border border-brand-line p-8 shadow-sm">
          <AlertTriangle className="w-10 h-10 mx-auto text-brand-primary" strokeWidth={1.5} />
          <h1 className="font-serif-display text-3xl text-brand-text">
            Couldn&rsquo;t load this recipe.
          </h1>
          <p className="text-sm text-brand-text-soft">
            It may have been cleared from your device or the link is stale.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              data-testid="cook-retry-btn"
              onClick={() => window.location.reload()}
              className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white px-6"
            >
              <RotateCcw className="w-4 h-4 mr-2" strokeWidth={1.9} /> Try again
            </Button>
            <Button
              data-testid="cook-back-btn"
              variant="outline"
              onClick={() => navigate("/inspire")}
              className="rounded-full bg-white border-brand-line text-brand-text px-5"
            >
              Browse ideas
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const stepIngredients = ingredientsForStep(currentStep, recipe.ingredients_detailed);
  const headerImage = recipeImage(recipe, 0, { width: 1200, height: 420 });
  const hasRealInstructions = Array.isArray(recipe.instructions) && recipe.instructions.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-brand-bg flex flex-col"
      data-testid="cook-mode"
    >
      {/* Top bar */}
      <header className="px-5 md:px-10 py-4 flex items-center justify-between border-b border-brand-line bg-white/90 backdrop-blur-xl">
        <button
          data-testid="cook-exit-btn"
          onClick={exit}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text-soft hover:text-brand-primary"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.8} /> Exit
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-text" data-testid="cook-step-counter">
          <span className="text-brand-primary">Step {step + 1}</span>
          <span className="text-brand-text-soft">of {total}</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-sm text-brand-text-soft">
          <Clock className="w-4 h-4" strokeWidth={1.7} /> {recipe.time_minutes} min total
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1.5 bg-brand-line">
        <div
          className="h-full bg-brand-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
          data-testid="cook-progress"
        />
      </div>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 md:px-10 pb-10 md:pb-16">
          {/* Image header */}
          <div className="mt-5 md:mt-8 relative rounded-3xl overflow-hidden border border-brand-line bg-brand-line/30">
            <img
              src={headerImage}
              alt={recipe.title}
              className="w-full h-40 md:h-56 object-cover"
              loading="eager"
              data-testid="cook-header-image"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 space-y-1">
              <p className="text-xs tracking-[0.22em] uppercase font-semibold text-white/80">
                Now cooking
              </p>
              <h1
                data-testid="cook-recipe-title"
                className="font-serif-display text-2xl md:text-3xl text-white drop-shadow-sm"
              >
                {recipe.title}
              </h1>
            </div>
          </div>

          {/* Fallback banner if we had to synthesise steps */}
          {!hasRealInstructions && (
            <div
              data-testid="cook-fallback-banner"
              className="mt-5 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-sm text-brand-text flex items-start gap-3"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 text-brand-primary" strokeWidth={1.8} />
              <div className="flex-1">
                These steps are a starting guide. Tap Retry to fetch proper step-by-step instructions.
                <button
                  data-testid="cook-refetch-btn"
                  onClick={refetchRecipe}
                  disabled={refetching}
                  className="ml-2 font-semibold text-brand-primary hover:underline disabled:opacity-60"
                >
                  {refetching ? "Fetching…" : "Retry"}
                </button>
              </div>
            </div>
          )}

          {/* Step text */}
          <section className="mt-6 md:mt-10 space-y-5">
            <p
              className="font-serif-display text-3xl md:text-4xl italic text-brand-primary/70 leading-none"
              data-testid="cook-step-label"
            >
              Step {String(step + 1).padStart(2, "0")}
            </p>
            <p
              key={step}
              data-testid="cook-step-text"
              className="font-serif-display text-2xl md:text-4xl leading-[1.25] text-brand-text text-balance animate-fade-up"
            >
              {currentStep}
            </p>

            {/* Inline timer */}
            {duration && (
              <div
                data-testid="cook-timer"
                className="flex items-center gap-4 rounded-2xl bg-white border border-brand-line px-4 py-3"
              >
                <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-brand-primary" strokeWidth={1.8} />
                </div>
                <div className="flex-1">
                  <p className="text-xs tracking-[0.18em] uppercase font-semibold text-brand-text-soft">
                    Timer
                  </p>
                  <p
                    data-testid="cook-timer-clock"
                    className="font-mono text-2xl font-semibold tabular-nums text-brand-text"
                  >
                    {formatTimerClock(remaining)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="cook-timer-toggle-btn"
                    variant="outline"
                    onClick={toggleTimer}
                    className="rounded-full h-10 w-10 p-0 border-brand-line bg-white"
                    aria-label={timerRunning ? "Pause timer" : "Start timer"}
                  >
                    {timerRunning ? (
                      <Pause className="w-4 h-4" strokeWidth={2} />
                    ) : (
                      <Play className="w-4 h-4" strokeWidth={2} fill="currentColor" />
                    )}
                  </Button>
                  <Button
                    data-testid="cook-timer-reset-btn"
                    variant="outline"
                    onClick={resetTimer}
                    className="rounded-full h-10 w-10 p-0 border-brand-line bg-white"
                    aria-label="Reset timer"
                  >
                    <RotateCcw className="w-4 h-4" strokeWidth={1.8} />
                  </Button>
                </div>
              </div>
            )}

            {/* Relevant ingredients for this step */}
            {stepIngredients.length > 0 && (
              <div
                data-testid="cook-step-ingredients"
                className="rounded-2xl bg-white border border-brand-line p-4"
              >
                <p className="text-xs tracking-[0.18em] uppercase font-semibold text-brand-text-soft flex items-center gap-2 mb-2">
                  <ListOrdered className="w-3.5 h-3.5" strokeWidth={2} /> You&rsquo;ll use
                </p>
                <ul className="space-y-1.5">
                  {stepIngredients.map((ing, i) => {
                    const name = typeof ing === "string" ? ing : ing.name || "";
                    const qty = typeof ing === "string" ? "" : ing.quantity || "";
                    return (
                      <li
                        key={`${name}-${i}`}
                        data-testid={`cook-step-ingredient-${i}`}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="text-brand-text capitalize">{name}</span>
                        {qty && <span className="text-brand-text-soft font-mono text-xs">{qty}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer nav */}
      <footer className="border-t border-brand-line bg-white/90 backdrop-blur-xl px-5 md:px-10 py-4 flex items-center justify-between gap-3">
        <Button
          data-testid="cook-prev-btn"
          variant="outline"
          disabled={step === 0}
          onClick={prev}
          className="rounded-full px-5 py-5 text-sm font-semibold border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40 disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5 mr-1" strokeWidth={1.8} /> Prev
        </Button>

        <div className="hidden sm:flex gap-1.5">
          {steps.map((s, i) => (
            <span
              key={`${i}-${String(s).slice(0, 12)}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? "bg-brand-primary" : i < step ? "bg-brand-secondary" : "bg-brand-line"
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <Button
            data-testid="cook-finish-btn"
            onClick={exit}
            className="rounded-full px-6 py-5 text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary-dark text-white"
          >
            <Check className="w-5 h-5 mr-1" strokeWidth={2} /> Finish
          </Button>
        ) : (
          <Button
            data-testid="cook-next-btn"
            onClick={next}
            className="rounded-full px-6 py-5 text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)]"
          >
            Next <ChevronRight className="w-5 h-5 ml-1" strokeWidth={1.8} />
          </Button>
        )}
      </footer>

      {refetching && (
        <div className="fixed inset-0 z-[60] bg-black/20 grid place-items-center">
          <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
            <span className="text-sm text-brand-text">Fetching full instructions…</span>
          </div>
        </div>
      )}
    </div>
  );
}

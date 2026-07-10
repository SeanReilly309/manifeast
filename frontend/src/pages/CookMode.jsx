import { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";

export default function CookMode() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { recipes, favorites } = useApp();
  const recipe =
    recipes?.find((r) => r.id === id) ||
    favorites?.find((r) => r.id === id) ||
    null;
  const steps = recipe?.instructions || [];
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, steps.length - 1)), [steps.length]);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const exit = useCallback(() => navigate(`/recipe/${id}`), [navigate, id]);

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

  if (!recipe || steps.length === 0) {
    return (
      <div className="text-center py-24 space-y-4" data-testid="cook-missing">
        <h1 className="font-serif-display text-3xl text-brand-text">No recipe to cook.</h1>
        <Button onClick={() => navigate("/results")} className="rounded-full bg-brand-primary text-white">
          Back to meals
        </Button>
      </div>
    );
  }

  const progress = ((step + 1) / steps.length) * 100;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-brand-bg flex flex-col" data-testid="cook-mode">
      {/* Top bar */}
      <header className="px-5 md:px-10 py-5 flex items-center justify-between border-b border-brand-line bg-white/80 backdrop-blur-xl">
        <button
          data-testid="cook-exit-btn"
          onClick={exit}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text-soft hover:text-brand-primary"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.8} /> Exit cook mode
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-text">
          <span className="text-brand-primary">{step + 1}</span>
          <span className="text-brand-text-soft">/ {steps.length}</span>
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
      <main className="flex-1 overflow-y-auto px-6 md:px-12 py-10 md:py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
              {recipe.title}
            </p>
            <p className="font-serif-display text-3xl md:text-4xl italic text-brand-primary/70 leading-none">
              Step {String(step + 1).padStart(2, "0")}
            </p>
          </div>
          <p
            key={step}
            data-testid="cook-step-text"
            className="font-serif-display text-3xl md:text-5xl leading-[1.15] text-brand-text text-balance animate-fade-up"
          >
            {steps[step]}
          </p>
        </div>
      </main>

      {/* Footer nav */}
      <footer className="border-t border-brand-line bg-white/80 backdrop-blur-xl px-5 md:px-10 py-5 flex items-center justify-between gap-3">
        <Button
          data-testid="cook-prev-btn"
          variant="outline"
          disabled={step === 0}
          onClick={prev}
          className="rounded-full px-6 py-5 text-sm font-semibold border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40 disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5 mr-1" strokeWidth={1.8} /> Previous
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
            className="rounded-full px-7 py-5 text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary-dark text-white"
          >
            <Check className="w-5 h-5 mr-1" strokeWidth={2} /> Finish
          </Button>
        ) : (
          <Button
            data-testid="cook-next-btn"
            onClick={next}
            className="rounded-full px-7 py-5 text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)]"
          >
            Next step <ChevronRight className="w-5 h-5 ml-1" strokeWidth={1.8} />
          </Button>
        )}
      </footer>
    </div>
  );
}

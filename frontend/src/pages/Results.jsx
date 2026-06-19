import { Link, useNavigate } from "react-router-dom";
import { Salad } from "lucide-react";
import { Button } from "../components/ui/button";
import { RecipeCard } from "../components/RecipeCard";
import { useApp } from "../context/AppContext";

export default function Results() {
  const { recipes, ingredients } = useApp();
  const navigate = useNavigate();

  if (!recipes || recipes.length === 0) {
    return (
      <div className="text-center py-24 space-y-6" data-testid="results-empty">
        <Salad className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          No recipes yet.
        </h1>
        <p className="text-brand-text-soft max-w-md mx-auto">
          Head to the Scan screen and tell us what&rsquo;s in your kitchen.
        </p>
        <Link to="/scan">
          <Button
            data-testid="results-go-scan-btn"
            className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white"
          >
            Start a scan
          </Button>
        </Link>
      </div>
    );
  }

  const handleOpen = (idx) => navigate(`/recipe/${idx}`);

  return (
    <div className="space-y-10" data-testid="results-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-fade-up">
        <div className="space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Your meals
          </p>
          <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            You can make&hellip;
          </h1>
          <p className="text-brand-text-soft max-w-xl">
            {recipes.length} ideas using mostly what you already have ({ingredients.length} ingredients).
          </p>
        </div>
        <Link to="/scan">
          <Button
            data-testid="edit-ingredients-btn"
            variant="outline"
            className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
          >
            Edit ingredients
          </Button>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {recipes.map((r, i) => (
          <RecipeCard key={r.id || i} recipe={r} index={i} onOpen={handleOpen} />
        ))}
      </div>
    </div>
  );
}

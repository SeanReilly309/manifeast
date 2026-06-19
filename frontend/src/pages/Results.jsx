import { Link, useNavigate } from "react-router-dom";
import { Clock, ChefHat, ArrowRight, Salad } from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";

const RECIPE_IMG = [
  "https://images.pexels.com/photos/13294537/pexels-photo-13294537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/33515064/pexels-photo-33515064.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/8142046/pexels-photo-8142046.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

function difficultyTone(d) {
  if (d === "easy") return "bg-brand-secondary/15 text-brand-secondary-dark";
  if (d === "medium") return "bg-brand-accent/30 text-brand-text";
  return "bg-brand-primary/15 text-brand-primary";
}

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

  const handleOpen = (idx) => {
    navigate(`/recipe/${idx}`);
  };

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
          <article
            key={r.id || i}
            data-testid={`recipe-card-${i}`}
            onClick={() => handleOpen(i)}
            className="cursor-pointer group bg-white border border-brand-line rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="relative aspect-[5/4] overflow-hidden">
              <img
                src={RECIPE_IMG[i % RECIPE_IMG.length]}
                alt={r.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute top-3 left-3 flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${difficultyTone(r.difficulty)}`}>
                  {r.difficulty}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-brand-text flex items-center gap-1">
                  <Clock className="w-3 h-3" strokeWidth={2} /> {r.time_minutes} min
                </span>
              </div>
              <div className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-xl">
                {r.emoji || "🍽️"}
              </div>
            </div>
            <div className="p-5 space-y-3">
              <h3 className="font-serif-display text-2xl font-medium text-brand-text leading-tight">
                {r.title}
              </h3>
              {r.description && (
                <p className="text-sm text-brand-text-soft leading-relaxed line-clamp-2">{r.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(r.ingredients_used || []).slice(0, 4).map((ing) => (
                  <span key={ing} className="chip-available !py-1 !px-2.5 !text-xs">{ing}</span>
                ))}
                {(r.ingredients_used || []).length > 4 && (
                  <span className="chip-missing !py-1 !px-2.5 !text-xs">
                    +{(r.ingredients_used || []).length - 4} more
                  </span>
                )}
              </div>
              {(r.missing_ingredients || []).length > 0 && (
                <p className="text-xs text-brand-text-soft pt-1">
                  Missing: <span className="text-brand-primary font-medium">
                    {r.missing_ingredients.slice(0, 3).join(", ")}
                    {r.missing_ingredients.length > 3 ? "…" : ""}
                  </span>
                </p>
              )}
              <div className="pt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <ChefHat className="w-4 h-4" strokeWidth={1.7} /> Cook this
                <ArrowRight className="w-4 h-4" strokeWidth={1.7} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

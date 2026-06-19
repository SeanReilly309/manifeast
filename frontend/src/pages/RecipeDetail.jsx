import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, ChefHat, ShoppingBasket, Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";

const RECIPE_IMG = [
  "https://images.pexels.com/photos/13294537/pexels-photo-13294537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/33515064/pexels-photo-33515064.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/8142046/pexels-photo-8142046.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

export default function RecipeDetail() {
  const { idx } = useParams();
  const navigate = useNavigate();
  const { recipes, addShoppingItems } = useApp();
  const i = Number(idx);
  const recipe = recipes?.[i];

  if (!recipe) {
    return (
      <div className="text-center py-24 space-y-6" data-testid="recipe-missing">
        <h1 className="font-serif-display text-4xl text-brand-text">Recipe not found.</h1>
        <Link to="/results">
          <Button className="rounded-full bg-brand-primary text-white hover:bg-brand-primary-dark px-6">
            Back to meals
          </Button>
        </Link>
      </div>
    );
  }

  const handleAddMissing = () => {
    if (!recipe.missing_ingredients || recipe.missing_ingredients.length === 0) {
      toast.info("No missing items — you're all set!");
      return;
    }
    addShoppingItems(recipe.missing_ingredients);
    toast.success(`Added ${recipe.missing_ingredients.length} item(s) to your shopping list`);
  };

  return (
    <div className="space-y-10" data-testid="recipe-detail-page">
      <button
        data-testid="back-to-results-btn"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-brand-text-soft hover:text-brand-primary"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.7} /> Back to meals
      </button>

      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
        <div className="relative rounded-3xl overflow-hidden border border-brand-line">
          <img
            src={RECIPE_IMG[i % RECIPE_IMG.length]}
            alt={recipe.title}
            className="w-full h-[360px] md:h-[480px] object-cover"
          />
          <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-2xl">
            {recipe.emoji || "🍽️"}
          </div>
        </div>

        <div className="space-y-6 animate-fade-up">
          <div className="space-y-3">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
              Tonight&rsquo;s pick
            </p>
            <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text leading-tight">
              {recipe.title}
            </h1>
            {recipe.description && (
              <p className="text-brand-text-soft text-base leading-relaxed">{recipe.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-brand-line">
              <Clock className="w-4 h-4 text-brand-primary" strokeWidth={1.7} /> {recipe.time_minutes} min
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-brand-line capitalize">
              <ChefHat className="w-4 h-4 text-brand-primary" strokeWidth={1.7} /> {recipe.difficulty}
            </span>
            {recipe.servings > 0 && (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-brand-line">
                Serves {recipe.servings}
              </span>
            )}
          </div>

          {recipe.nutrition && recipe.nutrition.calories > 0 && (
            <div data-testid="nutrition-panel" className="rounded-2xl bg-white border border-brand-line p-5">
              <div className="flex items-end justify-between mb-3">
                <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
                  Per serving
                </p>
                <p className="text-xs text-brand-text-soft italic">approximate</p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "kcal", value: recipe.nutrition.calories, accent: true },
                  { label: "protein", value: `${recipe.nutrition.protein_g}g` },
                  { label: "fat", value: `${recipe.nutrition.fat_g}g` },
                  { label: "carbs", value: `${recipe.nutrition.carbs_g}g` },
                ].map((m) => (
                  <div key={m.label} className="text-center">
                    <div className={`font-serif-display text-3xl md:text-4xl font-medium leading-none ${m.accent ? "text-brand-primary" : "text-brand-text"}`}>
                      {m.value}
                    </div>
                    <div className="text-[11px] tracking-[0.18em] uppercase text-brand-text-soft mt-2">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
              You have
            </h3>
            <div className="flex flex-wrap gap-2">
              {(recipe.ingredients_used || []).map((ing) => (
                <span key={ing} className="chip-available">
                  <Check className="w-3 h-3" strokeWidth={2.5} /> {ing}
                </span>
              ))}
              {(recipe.ingredients_used || []).length === 0 && (
                <p className="text-sm text-brand-text-soft">No used items listed.</p>
              )}
            </div>
          </div>

          {(recipe.missing_ingredients || []).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
                You&rsquo;ll need
              </h3>
              <div className="flex flex-wrap gap-2">
                {recipe.missing_ingredients.map((ing) => (
                  <span key={ing} className="chip-missing" data-testid={`missing-${ing}`}>
                    {ing}
                  </span>
                ))}
              </div>
              <Button
                data-testid="add-to-shopping-btn"
                onClick={handleAddMissing}
                className="rounded-full px-6 py-5 text-sm font-semibold bg-brand-text hover:bg-brand-text/90 text-white mt-1"
              >
                <ShoppingBasket className="w-4 h-4 mr-2" strokeWidth={1.7} />
                Add missing to shopping list
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="editorial-divider" />

      <div className="grid md:grid-cols-3 gap-10">
        <div className="md:col-span-1 space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            How to cook it
          </p>
          <h2 className="font-serif-display text-3xl md:text-4xl font-medium text-brand-text">
            Step by step.
          </h2>
        </div>
        <ol className="md:col-span-2 space-y-5" data-testid="instruction-list">
          {(recipe.instructions || []).map((step, idx2) => (
            <li key={`${idx2}-${step.slice(0, 24)}`} className="flex gap-5">
              <span className="font-serif-display text-3xl italic text-brand-primary/70 w-10 leading-none flex-shrink-0">
                {String(idx2 + 1).padStart(2, "0")}
              </span>
              <p className="text-brand-text leading-relaxed pt-1">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

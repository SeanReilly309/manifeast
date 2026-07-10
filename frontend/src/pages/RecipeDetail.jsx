import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, ChefHat, ShoppingBasket, Check, Heart, Share2, Play } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { recipeImage, fallbackFoodImage } from "../lib/recipeImage";
import { scaleQuantity, scaleServings } from "../lib/scale";

const SCALES = [
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

function buildShareText(recipe) {
  const lines = [
    `${recipe.emoji || "🍽️"} ${recipe.title} — via Manifeast`,
    recipe.description ? `\n${recipe.description}` : "",
    `\n⏱ ${recipe.time_minutes} min · ${recipe.difficulty}`,
    recipe.nutrition?.calories ? ` · ${recipe.nutrition.calories} kcal` : "",
    recipe.ingredients_used?.length
      ? `\n\nIngredients you'll use:\n• ${recipe.ingredients_used.join("\n• ")}`
      : "",
    recipe.missing_ingredients?.length
      ? `\n\nYou'll also need:\n• ${recipe.missing_ingredients.join("\n• ")}`
      : "",
    recipe.instructions?.length
      ? `\n\nSteps:\n${recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "",
  ];
  return lines.join("");
}

export default function RecipeDetail() {
  const { idx } = useParams();
  const navigate = useNavigate();
  const { recipes, addShoppingItems, isFavorite, toggleFavorite } = useApp();
  const [scale, setScale] = useState(1);
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

  const fav = isFavorite(recipe);

  const handleAddMissing = () => {
    if (!recipe.missing_ingredients || recipe.missing_ingredients.length === 0) {
      toast.info("No missing items — you're all set!");
      return;
    }
    addShoppingItems(recipe.missing_ingredients);
    toast.success(`Added ${recipe.missing_ingredients.length} item(s) to your shopping list`);
  };

  const handleShare = async () => {
    const text = buildShareText(recipe);
    const shareData = {
      title: `${recipe.title} — Manifeast`,
      text,
      url: window.location.href,
    };
    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Recipe copied to your clipboard");
    } catch {
      toast.error("Couldn't copy — please try again.");
    }
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
            src={recipeImage(recipe, i, { width: 940, height: 900 })}
            alt={recipe.title}
            onError={(e) => { e.currentTarget.src = fallbackFoodImage(i); }}
            className="w-full h-[360px] md:h-[480px] object-cover"
          />
          <button
            data-testid="detail-fav-btn"
            onClick={() => toggleFavorite(recipe)}
            aria-label={fav ? "Remove from favorites" : "Save to favorites"}
            className={`absolute top-4 left-4 w-12 h-12 rounded-full flex items-center justify-center transition-all backdrop-blur-md ${
              fav
                ? "bg-brand-primary text-white"
                : "bg-white/90 text-brand-text-soft hover:text-brand-primary"
            }`}
          >
            <Heart className="w-6 h-6" strokeWidth={1.8} fill={fav ? "currentColor" : "none"} />
          </button>
          <button
            data-testid="detail-share-btn"
            onClick={handleShare}
            aria-label="Share recipe"
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-brand-text-soft hover:text-brand-primary transition-colors"
          >
            <Share2 className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-2xl">
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
            {recipe.yield_text ? (
              <span
                data-testid="recipe-yield"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary font-semibold"
              >
                {scaleQuantity(recipe.yield_text, scale)}
              </span>
            ) : recipe.servings > 0 ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-brand-line">
                Serves {scaleServings(recipe.servings, scale)}
              </span>
            ) : null}
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

          {recipe.ingredients_detailed && recipe.ingredients_detailed.length > 0 && (
            <div className="space-y-3" data-testid="ingredients-detailed">
              <div className="flex items-end justify-between gap-3">
                <h3 className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
                  Ingredients
                </h3>
                <div
                  data-testid="scale-toggle"
                  className="inline-flex items-center rounded-full bg-white border border-brand-line p-0.5"
                  role="group"
                  aria-label="Scale recipe"
                >
                  {SCALES.map((s) => {
                    const active = s.value === scale;
                    return (
                      <button
                        key={s.value}
                        data-testid={`scale-${s.value === 0.5 ? "half" : s.value === 1 ? "1x" : "2x"}`}
                        onClick={() => setScale(s.value)}
                        aria-pressed={active}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          active
                            ? "bg-brand-primary text-white"
                            : "text-brand-text-soft hover:text-brand-text"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ul className="rounded-2xl bg-white border border-brand-line divide-y divide-brand-line overflow-hidden">
                {recipe.ingredients_detailed.map((ing, k) => (
                  <li
                    key={`${k}-${ing.name}`}
                    className="flex items-baseline justify-between gap-4 px-4 py-3"
                  >
                    <span className="text-brand-text capitalize">{ing.name}</span>
                    {ing.quantity && (
                      <span
                        data-testid={`qty-${k}`}
                        className="text-sm font-semibold text-brand-primary tabular-nums text-right whitespace-nowrap"
                      >
                        {scaleQuantity(ing.quantity, scale)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!(recipe.ingredients_detailed?.length > 0 && (recipe.missing_ingredients || []).length === 0) && (
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
          )}

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

          <div className="pt-2 flex flex-wrap gap-3">
            <Button
              data-testid="start-cook-mode-btn"
              onClick={() => navigate(`/recipe/${i}/cook`)}
              className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)]"
            >
              <Play className="w-5 h-5 mr-2" strokeWidth={1.7} fill="currentColor" /> Start cooking
            </Button>
          </div>
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
          <p className="text-sm text-brand-text-soft pt-2">
            Tip: use cook mode for a hands-free, fullscreen view while you cook.
          </p>
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

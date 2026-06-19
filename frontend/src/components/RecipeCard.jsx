import { memo } from "react";
import { Clock, ChefHat, ArrowRight } from "lucide-react";

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

function RecipeCardBase({ recipe, index, onOpen }) {
  const usedAll = recipe.ingredients_used || [];
  const used = usedAll.slice(0, 4);
  const usedExtra = Math.max(0, usedAll.length - used.length);
  const missing = recipe.missing_ingredients || [];
  const n = recipe.nutrition;
  const showMacros = n && (n.protein_g > 0 || n.fat_g > 0 || n.carbs_g > 0);

  return (
    <article
      data-testid={`recipe-card-${index}`}
      onClick={() => onOpen(index)}
      className="cursor-pointer group bg-white border border-brand-line rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative aspect-[5/4] overflow-hidden">
        <img
          src={RECIPE_IMG[index % RECIPE_IMG.length]}
          alt={recipe.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${difficultyTone(recipe.difficulty)}`}>
            {recipe.difficulty}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-brand-text flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={2} /> {recipe.time_minutes} min
          </span>
          {n?.calories > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-brand-text">
              {n.calories} kcal
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-xl">
          {recipe.emoji || "🍽️"}
        </div>
      </div>
      <div className="p-5 space-y-3">
        <h3 className="font-serif-display text-2xl font-medium text-brand-text leading-tight">
          {recipe.title}
        </h3>
        {recipe.description && (
          <p className="text-sm text-brand-text-soft leading-relaxed line-clamp-2">{recipe.description}</p>
        )}
        {showMacros && (
          <div className="flex gap-4 text-xs text-brand-text-soft pt-1">
            <span><span className="font-semibold text-brand-text">{n.protein_g}g</span> protein</span>
            <span><span className="font-semibold text-brand-text">{n.fat_g}g</span> fat</span>
            <span><span className="font-semibold text-brand-text">{n.carbs_g}g</span> carbs</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {used.map((ing) => (
            <span key={ing} className="chip-available !py-1 !px-2.5 !text-xs">{ing}</span>
          ))}
          {usedExtra > 0 && (
            <span className="chip-missing !py-1 !px-2.5 !text-xs">+{usedExtra} more</span>
          )}
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-brand-text-soft pt-1">
            Missing: <span className="text-brand-primary font-medium">
              {missing.slice(0, 3).join(", ")}{missing.length > 3 ? "…" : ""}
            </span>
          </p>
        )}
        <div className="pt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity">
          <ChefHat className="w-4 h-4" strokeWidth={1.7} /> Cook this
          <ArrowRight className="w-4 h-4" strokeWidth={1.7} />
        </div>
      </div>
    </article>
  );
}

export const RecipeCard = memo(RecipeCardBase);

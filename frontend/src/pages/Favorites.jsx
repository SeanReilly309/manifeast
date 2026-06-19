import { Link, useNavigate } from "react-router-dom";
import { Heart, Salad } from "lucide-react";
import { Button } from "../components/ui/button";
import { RecipeCard } from "../components/RecipeCard";
import { useApp } from "../context/AppContext";

export default function Favorites() {
  const { favorites, recipes, setRecipes } = useApp();
  const navigate = useNavigate();

  if (!favorites || favorites.length === 0) {
    return (
      <div className="text-center py-24 space-y-6" data-testid="favorites-empty">
        <Heart className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          No favorites yet.
        </h1>
        <p className="text-brand-text-soft max-w-md mx-auto">
          Tap the heart on any recipe to save it here for later.
        </p>
        <Link to="/scan">
          <Button
            data-testid="favorites-go-scan-btn"
            className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white"
          >
            <Salad className="w-5 h-5 mr-2" strokeWidth={1.7} /> Find some meals
          </Button>
        </Link>
      </div>
    );
  }

  const handleOpen = (idx) => {
    // Open from favorites — load this single favorite into the active recipes list
    // so RecipeDetail can find it by index.
    const recipe = favorites[idx];
    const existingIdx = recipes.findIndex((r) => (r.id || r.title) === (recipe.id || recipe.title));
    if (existingIdx >= 0) {
      navigate(`/recipe/${existingIdx}`);
    } else {
      const merged = [recipe, ...recipes];
      setRecipes(merged);
      navigate(`/recipe/0`);
    }
  };

  return (
    <div className="space-y-10" data-testid="favorites-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Saved
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          Your favorite feasts.
        </h1>
        <p className="text-brand-text-soft">
          {favorites.length} recipe{favorites.length === 1 ? "" : "s"} saved for later.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {favorites.map((r, i) => (
          <RecipeCard key={r.id || r.title || i} recipe={r} index={i} onOpen={handleOpen} />
        ))}
      </div>
    </div>
  );
}

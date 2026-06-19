import { Link } from "react-router-dom";
import { Trash2, Check, ShoppingBasket } from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";

export default function ShoppingList() {
  const { shoppingList, toggleShoppingItem, removeShoppingItem, clearShopping } = useApp();
  const remaining = shoppingList.filter((i) => !i.checked);

  return (
    <div className="space-y-10" data-testid="shopping-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 animate-fade-up">
        <div className="space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Shopping list
          </p>
          <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            For the next grocery run.
          </h1>
          <p className="text-brand-text-soft">
            {shoppingList.length === 0
              ? "Empty for now — add missing ingredients from any recipe."
              : `${remaining.length} item${remaining.length === 1 ? "" : "s"} to grab`}
          </p>
        </div>
        {shoppingList.length > 0 && (
          <Button
            data-testid="clear-shopping-btn"
            variant="outline"
            onClick={clearShopping}
            className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
          >
            Clear list
          </Button>
        )}
      </div>

      {shoppingList.length === 0 ? (
        <div className="text-center py-16 space-y-5 bg-white border border-brand-line rounded-3xl">
          <ShoppingBasket className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
          <p className="text-brand-text-soft">Nothing here yet.</p>
          <Link to="/results">
            <Button className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white px-6">
              Browse meal ideas
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="bg-white border border-brand-line rounded-3xl divide-y divide-brand-line overflow-hidden">
          {shoppingList.map((item) => (
            <li
              key={item.name}
              data-testid={`shopping-item-${item.name}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-brand-bg/60 transition-colors"
            >
              <button
                data-testid={`toggle-${item.name}`}
                onClick={() => toggleShoppingItem(item.name)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  item.checked
                    ? "bg-brand-secondary border-brand-secondary text-white"
                    : "border-brand-text/30 hover:border-brand-primary"
                }`}
                aria-label={`Toggle ${item.name}`}
              >
                {item.checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </button>
              <span
                className={`flex-1 text-base ${
                  item.checked ? "line-through text-brand-text-soft" : "text-brand-text"
                }`}
              >
                {item.name}
              </span>
              <button
                data-testid={`remove-${item.name}`}
                onClick={() => removeShoppingItem(item.name)}
                className="text-brand-text-soft hover:text-brand-err"
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

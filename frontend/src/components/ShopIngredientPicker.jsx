import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShoppingBasket, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useApp } from "../context/AppContext";

// Merge detailed + used + missing ingredients into a deduped list.
function collectIngredients(recipe) {
  if (!recipe) return [];
  const detailed = Array.isArray(recipe.ingredients_detailed)
    ? recipe.ingredients_detailed
        .map((it) => (it && typeof it.name === "string" ? it.name : ""))
        .filter(Boolean)
    : [];
  const used = Array.isArray(recipe.ingredients_used) ? recipe.ingredients_used : [];
  const missing = Array.isArray(recipe.missing_ingredients) ? recipe.missing_ingredients : [];
  const seen = new Set();
  const out = [];
  for (const name of [...detailed, ...used, ...missing]) {
    const key = String(name).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: key, missing: missing.map((m) => m.toLowerCase()).includes(key) });
  }
  return out;
}

export function ShopIngredientPicker({ recipe, open, onOpenChange }) {
  const { addShoppingItems } = useApp();
  const items = useMemo(() => collectIngredients(recipe), [recipe]);
  const [selected, setSelected] = useState(new Set());

  // When the dialog opens (or recipe changes) select everything by default
  useEffect(() => {
    if (open) setSelected(new Set(items.map((i) => i.name)));
  }, [open, items]);

  if (!recipe) return null;

  const toggle = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.name)));
  const selectNone = () => setSelected(new Set());
  const selectMissingOnly = () =>
    setSelected(new Set(items.filter((i) => i.missing).map((i) => i.name)));

  const handleAdd = () => {
    const picked = [...selected];
    if (picked.length === 0) {
      toast.error("Pick at least one ingredient.");
      return;
    }
    addShoppingItems(picked);
    toast.success(`Added ${picked.length} item${picked.length === 1 ? "" : "s"} to shopping list`);
    onOpenChange(false);
  };

  const missingCount = items.filter((i) => i.missing).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="shop-picker-dialog"
        className="max-w-md bg-brand-bg border-brand-line max-h-[85vh] overflow-hidden flex flex-col p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-brand-line">
          <DialogTitle className="font-serif-display text-2xl text-brand-text leading-tight">
            Add to shopping list
          </DialogTitle>
          <p className="text-sm text-brand-text-soft leading-relaxed pt-1">
            From <span className="italic">{recipe.title}</span> &mdash; tap items to include or skip.
          </p>
        </DialogHeader>

        <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-brand-line bg-white/50">
          <button
            type="button"
            onClick={selectAll}
            data-testid="picker-select-all"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-text text-white"
          >
            All ({items.length})
          </button>
          {missingCount > 0 && (
            <button
              type="button"
              onClick={selectMissingOnly}
              data-testid="picker-select-missing"
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-primary/10 text-brand-primary"
            >
              Missing only ({missingCount})
            </button>
          )}
          <button
            type="button"
            onClick={selectNone}
            data-testid="picker-select-none"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white text-brand-text-soft border border-brand-line"
          >
            None
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" data-testid="picker-list">
          {items.length === 0 && (
            <p className="p-6 text-sm text-brand-text-soft text-center italic">
              No ingredients found on this recipe.
            </p>
          )}
          {items.map((it) => {
            const on = selected.has(it.name);
            return (
              <button
                key={it.name}
                type="button"
                data-testid={`picker-item-${it.name}`}
                onClick={() => toggle(it.name)}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                  on
                    ? "bg-white border border-brand-primary/40 shadow-[0_2px_10px_rgba(224,122,95,0.08)]"
                    : "bg-white/60 border border-brand-line hover:bg-white"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                    on
                      ? "bg-brand-primary border-brand-primary text-white"
                      : "bg-white border-brand-text/25"
                  }`}
                >
                  {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                </span>
                <span className="capitalize text-brand-text font-medium flex-1">{it.name}</span>
                {it.missing && (
                  <span className="text-[10px] tracking-[0.14em] uppercase text-brand-primary font-semibold">
                    missing
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-brand-line bg-white/60">
          <Button
            data-testid="picker-add-btn"
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="w-full rounded-full py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.28)]"
          >
            <ShoppingBasket className="w-5 h-5 mr-2" strokeWidth={1.8} />
            Add {selected.size} to shopping list
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

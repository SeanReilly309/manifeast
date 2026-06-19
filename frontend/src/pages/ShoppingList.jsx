import { useCallback } from "react";
import { Link } from "react-router-dom";
import { ShoppingBasket, ExternalLink, Globe } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { ShoppingItemRow } from "../components/ShoppingItemRow";
import { useApp } from "../context/AppContext";
import { COUNTRIES, getCountry } from "../lib/retailers";

function RetailerBand({ remainingCount, retailers, onShop }) {
  return (
    <section
      data-testid="retailer-band"
      className="rounded-3xl bg-brand-text text-white p-6 md:p-8 grain relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-primary/25 blur-3xl" />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2 max-w-md">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-accent">
            Shop the list
          </p>
          <h2 className="font-serif-display text-2xl md:text-3xl font-medium leading-snug">
            Send your {remainingCount} item{remainingCount === 1 ? "" : "s"} straight to a grocer.
          </h2>
          <p className="text-white/65 text-sm">
            Opens a search at your chosen retailer &mdash; one tap and you&rsquo;re ready to checkout.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {retailers.map((r) => (
            <button
              key={r.id}
              data-testid={`shop-bulk-${r.id}-btn`}
              onClick={() => onShop(r)}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-white text-brand-text hover:bg-brand-accent transition-colors"
              style={{ boxShadow: `0 8px 24px ${r.color}33` }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
              {r.name}
              <ExternalLink className="w-3.5 h-3.5 opacity-60" strokeWidth={1.7} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 space-y-5 bg-white border border-brand-line rounded-3xl">
      <ShoppingBasket className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
      <p className="text-brand-text-soft">Nothing here yet.</p>
      <Link to="/results">
        <Button className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white px-6">
          Browse meal ideas
        </Button>
      </Link>
    </div>
  );
}

export default function ShoppingList() {
  const {
    shoppingList,
    toggleShoppingItem,
    removeShoppingItem,
    clearShopping,
    country,
    setCountry,
  } = useApp();
  const remaining = shoppingList.filter((i) => !i.checked);
  const itemsToShop = remaining.map((i) => i.name);
  const retailers = getCountry(country).retailers;

  const openBulk = useCallback(
    (retailer) => {
      if (itemsToShop.length === 0) {
        toast.info("Nothing left to shop — your list is clear!");
        return;
      }
      const url = retailer.buildBulkUrl(itemsToShop);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success(`Opening ${retailer.name} with ${itemsToShop.length} item${itemsToShop.length === 1 ? "" : "s"}`);
    },
    [itemsToShop]
  );

  const openItem = useCallback((retailer, name) => {
    const url = retailer.buildItemUrl(name);
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

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
          <div className="flex items-center gap-3">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger
                data-testid="country-select"
                className="rounded-full bg-white border-brand-line w-[180px] focus:ring-0 focus:ring-offset-0"
              >
                <Globe className="w-4 h-4 mr-1.5 text-brand-primary" strokeWidth={1.7} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code} data-testid={`country-opt-${c.code}`}>
                    <span className="mr-2">{c.flag}</span>{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="clear-shopping-btn"
              variant="outline"
              onClick={clearShopping}
              className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
            >
              Clear list
            </Button>
          </div>
        )}
      </div>

      {remaining.length > 0 && (
        <RetailerBand remainingCount={remaining.length} retailers={retailers} onShop={openBulk} />
      )}

      {shoppingList.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="bg-white border border-brand-line rounded-3xl divide-y divide-brand-line overflow-hidden">
          {shoppingList.map((item) => (
            <ShoppingItemRow
              key={item.name}
              item={item}
              retailers={retailers}
              onToggle={toggleShoppingItem}
              onRemove={removeShoppingItem}
              onBuy={openItem}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";
import { Trash2, Check, ShoppingBasket, ExternalLink, ShoppingCart } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { RETAILERS } from "../lib/retailers";

export default function ShoppingList() {
  const { shoppingList, toggleShoppingItem, removeShoppingItem, clearShopping } = useApp();
  const remaining = shoppingList.filter((i) => !i.checked);
  const itemsToShop = remaining.map((i) => i.name);

  const openBulk = (retailer) => {
    if (itemsToShop.length === 0) {
      toast.info("Nothing left to shop — your list is clear!");
      return;
    }
    const url = retailer.buildBulkUrl(itemsToShop);
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(`Opening ${retailer.name} with ${itemsToShop.length} item${itemsToShop.length === 1 ? "" : "s"}`);
  };

  const openItem = (retailer, name) => {
    const url = retailer.buildItemUrl(name);
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

      {/* Shop-the-list retailer band */}
      {remaining.length > 0 && (
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
                Send your {remaining.length} item{remaining.length === 1 ? "" : "s"} straight to a grocer.
              </h2>
              <p className="text-white/65 text-sm">
                Opens a search at your chosen retailer — one tap and you&rsquo;re ready to checkout.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {RETAILERS.map((r) => (
                <button
                  key={r.id}
                  data-testid={`shop-bulk-${r.id}-btn`}
                  onClick={() => openBulk(r)}
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
      )}

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

              {!item.checked && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      data-testid={`buy-${item.name}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-primary-dark px-3 py-1.5 rounded-full hover:bg-brand-primary/8 transition-colors"
                      aria-label={`Find ${item.name} online`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.8} /> Buy
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl border-brand-line">
                    <DropdownMenuLabel className="text-xs uppercase tracking-[0.18em] text-brand-text-soft">
                      Find &ldquo;{item.name}&rdquo;
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {RETAILERS.map((r) => (
                      <DropdownMenuItem
                        key={r.id}
                        data-testid={`buy-${item.name}-${r.id}`}
                        onClick={() => openItem(r, item.name)}
                        className="cursor-pointer flex items-center gap-2 rounded-lg"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                        <span className="flex-1">{r.name}</span>
                        <ExternalLink className="w-3 h-3 opacity-50" strokeWidth={1.7} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

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

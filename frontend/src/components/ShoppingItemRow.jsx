import { memo } from "react";
import { Trash2, Check, ExternalLink, ShoppingCart } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function ShoppingItemRowBase({ item, retailers, onToggle, onRemove, onBuy }) {
  const { name, checked } = item;
  return (
    <li
      data-testid={`shopping-item-${name}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-brand-bg/60 transition-colors"
    >
      <button
        data-testid={`toggle-${name}`}
        onClick={() => onToggle(name)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          checked
            ? "bg-brand-secondary border-brand-secondary text-white"
            : "border-brand-text/30 hover:border-brand-primary"
        }`}
        aria-label={`Toggle ${name}`}
      >
        {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>
      <span
        className={`flex-1 text-base ${
          checked ? "line-through text-brand-text-soft" : "text-brand-text"
        }`}
      >
        {name}
      </span>

      {!checked && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid={`buy-${name}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-primary-dark px-3 py-1.5 rounded-full hover:bg-brand-primary/8 transition-colors"
              aria-label={`Find ${name} online`}
            >
              <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.8} /> Buy
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl border-brand-line">
            <DropdownMenuLabel className="text-xs uppercase tracking-[0.18em] text-brand-text-soft">
              Find &ldquo;{name}&rdquo;
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {retailers.map((r) => (
              <DropdownMenuItem
                key={r.id}
                data-testid={`buy-${name}-${r.id}`}
                onClick={() => onBuy(r, name)}
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
        data-testid={`remove-${name}`}
        onClick={() => onRemove(name)}
        className="text-brand-text-soft hover:text-brand-err"
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="w-4 h-4" strokeWidth={1.7} />
      </button>
    </li>
  );
}

export const ShoppingItemRow = memo(ShoppingItemRowBase);

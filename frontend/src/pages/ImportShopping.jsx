import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShoppingBasket, Check, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { decodeShoppingPayload } from "../lib/shareShop";

export default function ImportShopping() {
  const navigate = useNavigate();
  const { shoppingList, addShoppingItems } = useApp();

  // Read the token from the URL hash. We keep it in state because after we
  // clear the hash post-import we still want to render the confirmation.
  const [token] = useState(() =>
    (typeof window !== "undefined" ? (window.location.hash || "").replace(/^#/, "") : "")
  );

  const incoming = useMemo(() => decodeShoppingPayload(token), [token]);
  const existing = useMemo(
    () => new Set((shoppingList || []).map((i) => (i?.name || "").toLowerCase())),
    [shoppingList],
  );
  const brandNew = useMemo(() => incoming.filter((n) => !existing.has(n)), [incoming, existing]);
  const alreadyThere = incoming.length - brandNew.length;

  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (!token) return;
    // Auto-add if the sender shared only ONE item that we don't already have.
    // Rationale: forwarding a single item is the "hey grab me milk" case — no
    // reason to make the recipient tap twice.
    if (incoming.length === 1 && brandNew.length === 1 && !imported) {
      addShoppingItems(brandNew);
      setImported(true);
      toast.success(`Added "${brandNew[0]}" to your list`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAdd = () => {
    if (brandNew.length === 0) {
      toast.info("Nothing new to add — you already have these.");
      return;
    }
    addShoppingItems(brandNew);
    setImported(true);
    toast.success(
      `Added ${brandNew.length} item${brandNew.length === 1 ? "" : "s"} to your list`,
    );
  };

  if (!token || incoming.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-5" data-testid="import-invalid">
        <ShoppingBasket className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
        <h1 className="font-serif-display text-3xl text-brand-text">This link is empty.</h1>
        <p className="text-brand-text-soft">
          The shared list doesn&rsquo;t contain any items we can read. Ask them to send it again.
        </p>
        <Link to="/shopping">
          <Button className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white px-6">
            Go to my shopping list
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8" data-testid="import-shopping-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Someone shared a list
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          {imported
            ? "Added to your list."
            : incoming.length === 1
              ? `Grab this?`
              : `Add these ${incoming.length} items?`}
        </h1>
        {alreadyThere > 0 && !imported && (
          <p className="text-sm text-brand-text-soft" data-testid="import-dupes-note">
            {alreadyThere} item{alreadyThere === 1 ? " is" : "s are"} already on your list — we&rsquo;ll skip {alreadyThere === 1 ? "it" : "them"}.
          </p>
        )}
      </div>

      <ul
        data-testid="import-item-list"
        className="bg-white border border-brand-line rounded-3xl divide-y divide-brand-line overflow-hidden"
      >
        {incoming.map((name) => {
          const dup = existing.has(name);
          return (
            <li
              key={name}
              data-testid={`import-item-${name}`}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  dup
                    ? "bg-brand-line border-brand-line text-brand-text-soft"
                    : "border-brand-primary/40 text-brand-primary"
                }`}
                aria-hidden
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </div>
              <span
                className={`flex-1 text-base ${dup ? "text-brand-text-soft line-through" : "text-brand-text"}`}
              >
                {name}
              </span>
              {dup && (
                <span className="text-[11px] uppercase tracking-[0.16em] text-brand-text-soft">
                  Already added
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {!imported ? (
        <Button
          data-testid="import-add-btn"
          onClick={handleAdd}
          disabled={brandNew.length === 0}
          className="w-full rounded-full h-14 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_10px_28px_rgba(224,122,95,0.32)] disabled:opacity-50"
        >
          {brandNew.length === 0
            ? "Nothing new to add"
            : `Add ${brandNew.length} item${brandNew.length === 1 ? "" : "s"} to my list`}
        </Button>
      ) : (
        <Button
          data-testid="import-go-btn"
          onClick={() => navigate("/shopping")}
          className="w-full rounded-full h-14 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_10px_28px_rgba(224,122,95,0.32)]"
        >
          Open my shopping list <ArrowRight className="w-4 h-4 ml-2" strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}

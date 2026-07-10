import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Camera, ShoppingBasket, Heart, Utensils, Calculator, Sparkles } from "lucide-react";
import { useApp } from "../context/AppContext";

const navItems = [
  { to: "/", label: "Home", icon: Home, testId: "nav-home" },
  { to: "/scan", label: "Scan", icon: Camera, testId: "nav-scan" },
  { to: "/inspire", label: "Inspire", icon: Sparkles, testId: "nav-inspire" },
  { to: "/analyze", label: "Analyze", icon: Utensils, testId: "nav-analyze" },
  { to: "/coach", label: "Coach", icon: Calculator, testId: "nav-coach" },
  { to: "/favorites", label: "Saved", icon: Heart, testId: "nav-favorites" },
  { to: "/shopping", label: "Shop", icon: ShoppingBasket, testId: "nav-shopping" },
];

export default function AppShell() {
  const { shoppingList } = useApp();
  const location = useLocation();
  const unchecked = shoppingList.filter((i) => !i.checked).length;

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      {/* Top header */}
      <header
        data-testid="app-header"
        className="sticky top-0 z-40 backdrop-blur-xl bg-[#FAFAF7]/80 border-b border-brand-line"
      >
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center" data-testid="logo-link">
            <img
              src="/manifeast-logo.jpg"
              alt="Manifeast"
              className="h-14 md:h-16 w-auto select-none"
              style={{ mixBlendMode: "multiply" }}
            />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`${n.testId}-desktop`}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-primary text-white"
                      : "text-brand-text-soft hover:text-brand-text hover:bg-brand-line/60"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <NavLink
              to="/ask"
              data-testid="nav-ask-desktop"
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-primary text-white"
                    : "text-brand-text-soft hover:text-brand-text hover:bg-brand-line/60"
                }`
              }
            >
              Ask
            </NavLink>
            <NavLink
              to="/about"
              data-testid="nav-about-desktop"
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-primary text-white"
                    : "text-brand-text-soft hover:text-brand-text hover:bg-brand-line/60"
                }`
              }
            >
              About
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-8 pb-28 md:pb-16 pt-6 md:pt-10">
        <Outlet key={location.pathname} />
      </main>

      {/* Bottom nav (mobile) */}
      <nav
        data-testid="bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-[#FAFAF7]/85 border-t border-brand-line"
      >
        <div className="grid grid-cols-7">
          {navItems.map((n) => {
            const Icon = n.icon;
            const isShop = n.to === "/shopping";
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testId}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-3 px-0.5 text-[10px] ${
                    isActive ? "text-brand-primary" : "text-brand-text-soft"
                  }`
                }
              >
                <span className="relative">
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                  {isShop && unchecked > 0 && (
                    <span
                      data-testid="shopping-badge"
                      className="absolute -top-1.5 -right-2 bg-brand-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-semibold"
                    >
                      {unchecked}
                    </span>
                  )}
                </span>
                <span>{n.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

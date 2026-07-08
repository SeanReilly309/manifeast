import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Utensils, Trash2, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";

function ymd(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function humanDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (ymd(iso) === ymd(today.toISOString())) return "Today";
  if (ymd(iso) === ymd(yest.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function humanTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sumMacros(entries) {
  return entries.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.nutrition?.calories || 0),
      protein_g: acc.protein_g + (m.nutrition?.protein_g || 0),
      fat_g: acc.fat_g + (m.nutrition?.fat_g || 0),
      carbs_g: acc.carbs_g + (m.nutrition?.carbs_g || 0),
    }),
    { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 }
  );
}

function DailyTotals({ totals }) {
  return (
    <div className="grid grid-cols-4 gap-2 md:gap-4">
      {[
        { label: "kcal", value: totals.calories, accent: true },
        { label: "protein", value: `${totals.protein_g}g` },
        { label: "fat", value: `${totals.fat_g}g` },
        { label: "carbs", value: `${totals.carbs_g}g` },
      ].map((m) => (
        <div key={m.label} className="text-center rounded-2xl bg-brand-bg py-4">
          <div className={`font-serif-display text-2xl md:text-3xl font-medium leading-none ${m.accent ? "text-brand-primary" : "text-brand-text"}`}>
            {m.value}
          </div>
          <div className="text-[10px] tracking-[0.18em] uppercase text-brand-text-soft mt-2">
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogRow({ meal, onRemove }) {
  const n = meal.nutrition || {};
  return (
    <li
      data-testid={`log-row-${meal.id}`}
      className="flex items-start gap-4 px-5 py-4 hover:bg-brand-bg/60 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0">
        <Utensils className="w-4 h-4" strokeWidth={1.7} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif-display text-lg md:text-xl text-brand-text truncate">{meal.meal_name}</h3>
          <span className="text-xs text-brand-text-soft whitespace-nowrap flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.8} />{humanTime(meal.logged_at)}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-brand-text-soft mt-1.5 flex-wrap">
          <span><span className="font-semibold text-brand-primary">{n.calories}</span> kcal</span>
          <span><span className="font-semibold text-brand-text">{n.protein_g}g</span> P</span>
          <span><span className="font-semibold text-brand-text">{n.fat_g}g</span> F</span>
          <span><span className="font-semibold text-brand-text">{n.carbs_g}g</span> C</span>
        </div>
      </div>
      <button
        data-testid={`log-remove-${meal.id}`}
        onClick={() => onRemove(meal.id)}
        className="text-brand-text-soft hover:text-brand-err mt-1"
        aria-label={`Remove ${meal.meal_name}`}
      >
        <Trash2 className="w-4 h-4" strokeWidth={1.7} />
      </button>
    </li>
  );
}

export default function MealLog() {
  const { mealLog, removeMealFromLog, clearMealLog } = useApp();

  const grouped = useMemo(() => {
    const g = new Map();
    for (const m of mealLog) {
      const key = ymd(m.logged_at);
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(m);
    }
    return Array.from(g.entries()).map(([key, entries]) => ({
      key,
      label: humanDay(entries[0].logged_at),
      entries,
      totals: sumMacros(entries),
    }));
  }, [mealLog]);

  if (mealLog.length === 0) {
    return (
      <div className="text-center py-24 space-y-6" data-testid="log-empty">
        <Utensils className="w-12 h-12 mx-auto text-brand-primary/60" strokeWidth={1.5} />
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          No meals logged yet.
        </h1>
        <p className="text-brand-text-soft max-w-md mx-auto">
          Every meal you analyze gets saved here so you can see your day at a glance.
        </p>
        <Link to="/analyze">
          <Button
            data-testid="log-go-analyze-btn"
            className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white"
          >
            Analyze a meal
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10" data-testid="meal-log-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 animate-fade-up">
        <div className="space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Meal log
          </p>
          <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            Your day, plated.
          </h1>
          <p className="text-brand-text-soft">
            {mealLog.length} meal{mealLog.length === 1 ? "" : "s"} tracked · running macro totals per day.
          </p>
        </div>
        <Button
          data-testid="clear-log-btn"
          variant="outline"
          onClick={clearMealLog}
          className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
        >
          Clear log
        </Button>
      </div>

      <div className="space-y-10">
        {grouped.map((day) => (
          <section key={day.key} data-testid={`log-day-${day.key}`} className="space-y-4">
            <div className="flex items-end justify-between">
              <h2 className="font-serif-display text-2xl md:text-3xl font-medium text-brand-text">
                {day.label}
              </h2>
              <span className="text-xs text-brand-text-soft uppercase tracking-[0.18em] font-semibold">
                {day.entries.length} {day.entries.length === 1 ? "meal" : "meals"}
              </span>
            </div>
            <DailyTotals totals={day.totals} />
            <ul className="bg-white border border-brand-line rounded-3xl divide-y divide-brand-line overflow-hidden">
              {day.entries.map((meal) => (
                <LogRow key={meal.id} meal={meal} onRemove={removeMealFromLog} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-brand-text-soft text-center italic">
        Estimates are AI-generated. Not a substitute for a food diary you&rsquo;d bring to a dietician.
      </p>
    </div>
  );
}

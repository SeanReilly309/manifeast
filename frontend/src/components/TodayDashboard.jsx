import { Link } from "react-router-dom";
import { Target, Utensils, ArrowRight } from "lucide-react";
import { useApp } from "../context/AppContext";

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todaysTotals(mealLog) {
  const key = ymd(new Date());
  return mealLog
    .filter((m) => ymd(new Date(m.logged_at)) === key)
    .reduce(
      (acc, m) => ({
        calories: acc.calories + (m.nutrition?.calories || 0),
        protein_g: acc.protein_g + (m.nutrition?.protein_g || 0),
        fat_g: acc.fat_g + (m.nutrition?.fat_g || 0),
        carbs_g: acc.carbs_g + (m.nutrition?.carbs_g || 0),
        count: acc.count + 1,
      }),
      { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, count: 0 }
    );
}

export default function TodayDashboard() {
  const { mealLog, dailyGoal } = useApp();
  const totals = todaysTotals(mealLog);
  const hasGoal = dailyGoal && dailyGoal.calories > 0;
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const tiles = [
    { key: "calories", label: "kcal", value: totals.calories, target: dailyGoal?.calories || 0, accent: true },
    { key: "protein_g", label: "protein", value: totals.protein_g, suffix: "g", target: dailyGoal?.protein_g || 0 },
    { key: "fat_g", label: "fat", value: totals.fat_g, suffix: "g", target: dailyGoal?.fat_g || 0 },
    { key: "carbs_g", label: "carbs", value: totals.carbs_g, suffix: "g", target: dailyGoal?.carbs_g || 0 },
  ];

  return (
    <section
      data-testid="today-dashboard"
      className="bg-white border border-brand-line rounded-3xl p-6 md:p-8 space-y-6"
    >
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Today
          </p>
          <h2 className="font-serif-display text-2xl md:text-3xl font-medium text-brand-text leading-tight">
            {dateLabel}
          </h2>
          <p className="text-sm text-brand-text-soft">
            {totals.count === 0
              ? "No meals logged yet."
              : `${totals.count} meal${totals.count === 1 ? "" : "s"} tracked so far.`}
          </p>
        </div>
        <Link
          to="/log"
          data-testid="dashboard-view-log"
          className="text-sm font-semibold text-brand-primary hover:text-brand-primary-dark inline-flex items-center gap-1"
        >
          Full log <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2 md:gap-4" data-testid="dashboard-macros">
        {tiles.map((t) => {
          const pct = t.target > 0 ? Math.min(100, Math.round((t.value / t.target) * 100)) : 0;
          const over = t.target > 0 && t.value > t.target;
          const showBar = hasGoal && t.target > 0;
          return (
            <div key={t.label} data-testid={`tile-${t.key}`} className="rounded-2xl bg-brand-bg py-5 md:py-6 px-2 text-center">
              <div className={`font-serif-display text-3xl md:text-4xl lg:text-5xl font-medium leading-none ${t.accent ? "text-brand-primary" : "text-brand-text"}`}>
                {t.value}{t.suffix || ""}
              </div>
              {showBar ? (
                <>
                  <div className="text-[10px] text-brand-text-soft mt-2">
                    of <span className="font-semibold text-brand-text">{t.target}{t.suffix || ""}</span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-brand-line overflow-hidden mx-auto max-w-[80%]">
                    <div
                      className={`h-full rounded-full transition-all ${over ? "bg-brand-primary" : "bg-brand-secondary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-brand-text-soft mt-2 opacity-60">&mdash;</div>
              )}
              <div className="text-[10px] tracking-[0.18em] uppercase text-brand-text-soft mt-2.5">
                {t.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-line">
        {!hasGoal ? (
          <Link
            to="/coach"
            data-testid="dashboard-set-goal"
            className="text-sm font-semibold text-brand-text-soft hover:text-brand-primary inline-flex items-center gap-2"
          >
            <Target className="w-4 h-4" strokeWidth={1.7} />
            Get a personalized target
          </Link>
        ) : (
          <div className="text-sm text-brand-text-soft inline-flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-primary" strokeWidth={1.7} />
            {dailyGoal.calories - totals.calories > 0 ? (
              <span data-testid="kcal-remaining">
                <span className="font-semibold text-brand-secondary-dark">
                  {dailyGoal.calories - totals.calories}
                </span> kcal left today
              </span>
            ) : (
              <span data-testid="kcal-over-today" className="text-brand-primary font-semibold">
                {totals.calories - dailyGoal.calories} kcal over target
              </span>
            )}
          </div>
        )}
        <Link
          to="/analyze"
          data-testid="dashboard-analyze-cta"
          className="text-sm font-semibold text-brand-primary hover:text-brand-primary-dark inline-flex items-center gap-1.5"
        >
          <Utensils className="w-4 h-4" strokeWidth={1.7} />
          {totals.count === 0 ? "Log your first meal" : "Log another meal"}
          <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </Link>
      </div>
    </section>
  );
}

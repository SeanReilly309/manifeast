import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Utensils, Trash2, Clock, TrendingUp, Target, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
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

function rollingAverage(entries, days = 7) {
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const withinWindow = entries.filter((m) => new Date(m.logged_at).getTime() >= cutoff);
  if (withinWindow.length === 0) return null;

  const daySet = new Set(withinWindow.map((m) => ymd(m.logged_at)));
  const daysWithMeals = Math.max(daySet.size, 1);

  const totals = sumMacros(withinWindow);
  return {
    daysWithMeals,
    mealsTotal: withinWindow.length,
    avg: {
      calories: Math.round(totals.calories / daysWithMeals),
      protein_g: Math.round(totals.protein_g / daysWithMeals),
      fat_g: Math.round(totals.fat_g / daysWithMeals),
      carbs_g: Math.round(totals.carbs_g / daysWithMeals),
    },
  };
}

function AveragesBand({ stats }) {
  return (
    <section
      data-testid="averages-band"
      className="rounded-3xl bg-brand-text text-white p-6 md:p-8 grain relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-primary/25 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div className="space-y-1.5">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-accent flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} /> 7-day average
            </p>
            <h2 className="font-serif-display text-2xl md:text-3xl font-medium leading-snug">
              Your typical day.
            </h2>
          </div>
          <p className="text-xs text-white/60 uppercase tracking-[0.18em] font-semibold">
            {stats.daysWithMeals} day{stats.daysWithMeals === 1 ? "" : "s"} &middot; {stats.mealsTotal} meal{stats.mealsTotal === 1 ? "" : "s"}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 md:gap-6">
          {[
            { label: "kcal", value: stats.avg.calories, accent: true },
            { label: "protein", value: `${stats.avg.protein_g}g` },
            { label: "fat", value: `${stats.avg.fat_g}g` },
            { label: "carbs", value: `${stats.avg.carbs_g}g` },
          ].map((m) => (
            <div key={m.label} className="text-center bg-white/8 backdrop-blur-sm rounded-2xl py-5 border border-white/10">
              <div className={`font-serif-display text-3xl md:text-5xl font-medium leading-none ${m.accent ? "text-brand-accent" : "text-white"}`}>
                {m.value}
              </div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-white/60 mt-2.5">
                {m.label}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/50 italic">
          Averaged over days you actually logged meals &mdash; skipped days aren&rsquo;t counted.
        </p>
      </div>
    </section>
  );
}


function DailyTotals({ totals, goal }) {
  const hasGoal = goal && goal.calories > 0;
  const macros = [
    { key: "calories", label: "kcal", value: totals.calories, target: goal?.calories || 0, accent: true },
    { key: "protein_g", label: "protein", value: `${totals.protein_g}g`, raw: totals.protein_g, target: goal?.protein_g || 0 },
    { key: "fat_g", label: "fat", value: `${totals.fat_g}g`, raw: totals.fat_g, target: goal?.fat_g || 0 },
    { key: "carbs_g", label: "carbs", value: `${totals.carbs_g}g`, raw: totals.carbs_g, target: goal?.carbs_g || 0 },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 md:gap-4">
      {macros.map((m) => {
        const numeric = m.key === "calories" ? m.value : m.raw;
        const pct = m.target > 0 ? Math.min(100, Math.round((numeric / m.target) * 100)) : 0;
        const over = m.target > 0 && numeric > m.target;
        return (
          <div key={m.label} className="text-center rounded-2xl bg-brand-bg py-4 px-2">
            <div className={`font-serif-display text-2xl md:text-3xl font-medium leading-none ${m.accent ? "text-brand-primary" : "text-brand-text"}`}>
              {m.value}
            </div>
            {hasGoal && m.target > 0 && (
              <>
                <div className="text-[10px] text-brand-text-soft mt-2">
                  of <span className="font-semibold text-brand-text">{m.target}{m.key === "calories" ? "" : "g"}</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-brand-line overflow-hidden mx-auto max-w-[80%]">
                  <div
                    className={`h-full rounded-full transition-all ${over ? "bg-brand-primary" : "bg-brand-secondary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            )}
            <div className="text-[10px] tracking-[0.18em] uppercase text-brand-text-soft mt-2">
              {m.label}
            </div>
          </div>
        );
      })}
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
  const { mealLog, removeMealFromLog, clearMealLog, dailyGoal, setDailyGoal } = useApp();
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(dailyGoal);

  const openGoal = () => { setGoalDraft(dailyGoal); setGoalOpen(true); };
  const saveGoal = () => {
    setDailyGoal({
      calories: Math.max(0, parseInt(goalDraft.calories, 10) || 0),
      protein_g: Math.max(0, parseInt(goalDraft.protein_g, 10) || 0),
      fat_g: Math.max(0, parseInt(goalDraft.fat_g, 10) || 0),
      carbs_g: Math.max(0, parseInt(goalDraft.carbs_g, 10) || 0),
    });
    setGoalOpen(false);
  };
  const clearGoal = () => {
    setDailyGoal({ calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
    setGoalDraft({ calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
    setGoalOpen(false);
  };
  const hasGoal = dailyGoal && dailyGoal.calories > 0;

  const todayKey = ymd(new Date().toISOString());

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

  const rolling = useMemo(() => rollingAverage(mealLog, 7), [mealLog]);

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
        <div className="flex items-center gap-2">
          <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="set-target-btn"
                variant="outline"
                onClick={openGoal}
                className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
              >
                <Target className="w-4 h-4 mr-2" strokeWidth={1.7} />
                {hasGoal ? `${dailyGoal.calories} kcal target` : "Set daily target"}
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif-display text-2xl font-medium">
                  Set a daily target
                </DialogTitle>
                <DialogDescription className="text-brand-text-soft">
                  Leave a field at 0 to skip it. Calories is required to see progress bars.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                {[
                  { key: "calories", label: "Calories (kcal)" },
                  { key: "protein_g", label: "Protein (g)" },
                  { key: "fat_g", label: "Fat (g)" },
                  { key: "carbs_g", label: "Carbs (g)" },
                ].map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">
                      {f.label}
                    </label>
                    <Input
                      data-testid={`goal-input-${f.key}`}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={goalDraft[f.key] || ""}
                      onChange={(e) => setGoalDraft({ ...goalDraft, [f.key]: e.target.value })}
                      className="rounded-xl border-brand-line"
                    />
                  </div>
                ))}
              </div>
              <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
                {hasGoal && (
                  <Button
                    data-testid="clear-target-btn"
                    variant="ghost"
                    onClick={clearGoal}
                    className="text-brand-text-soft hover:text-brand-err"
                  >
                    <X className="w-4 h-4 mr-1" strokeWidth={1.7} /> Clear target
                  </Button>
                )}
                <Button
                  data-testid="save-target-btn"
                  onClick={saveGoal}
                  className="rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white ml-auto"
                >
                  Save target
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            data-testid="clear-log-btn"
            variant="outline"
            onClick={clearMealLog}
            className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
          >
            Clear log
          </Button>
        </div>
      </div>

      {rolling && <AveragesBand stats={rolling} />}

      <div className="space-y-10">
        {grouped.map((day) => {
          const isToday = day.key === todayKey;
          const kcalLeft = hasGoal && isToday ? dailyGoal.calories - day.totals.calories : null;
          return (
            <section key={day.key} data-testid={`log-day-${day.key}`} className="space-y-4">
              <div className="flex items-end justify-between">
                <h2 className="font-serif-display text-2xl md:text-3xl font-medium text-brand-text">
                  {day.label}
                </h2>
                <span className="text-xs text-brand-text-soft uppercase tracking-[0.18em] font-semibold">
                  {isToday && kcalLeft !== null ? (
                    kcalLeft > 0 ? (
                      <span data-testid="kcal-left"><span className="text-brand-secondary-dark font-bold">{kcalLeft}</span> kcal left</span>
                    ) : (
                      <span data-testid="kcal-over" className="text-brand-primary">
                        {Math.abs(kcalLeft)} kcal over
                      </span>
                    )
                  ) : (
                    `${day.entries.length} ${day.entries.length === 1 ? "meal" : "meals"}`
                  )}
                </span>
              </div>
              <DailyTotals totals={day.totals} goal={isToday ? dailyGoal : null} />
              <ul className="bg-white border border-brand-line rounded-3xl divide-y divide-brand-line overflow-hidden">
                {day.entries.map((meal) => (
                  <LogRow key={meal.id} meal={meal} onRemove={removeMealFromLog} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-brand-text-soft text-center italic">
        Estimates are AI-generated. Not a substitute for a food diary you&rsquo;d bring to a dietician.
      </p>
    </div>
  );
}

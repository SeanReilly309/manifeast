import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Calculator, Target, Activity, Check, Footprints, Dumbbell, Bike, Trophy, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useApp } from "../context/AppContext";

const LS_COACH_PROFILE = "manifeast_coach_profile";

const EXERCISE_TYPES = [
  { id: "walking", label: "Walking", icon: Footprints, mult: 0.7 },
  { id: "cardio", label: "Running / cardio", icon: Bike, mult: 1.15 },
  { id: "weights", label: "Lifting weights", icon: Dumbbell, mult: 0.9 },
  { id: "mixed", label: "Mixed / cross-train", icon: Activity, mult: 1.0 },
  { id: "sports", label: "Sports", icon: Trophy, mult: 1.05 },
];

const INTENSITIES = [
  { id: "easy", label: "Easy", description: "Gentle pace", baseKcal: 200 },
  { id: "moderate", label: "Moderate", description: "Working up a sweat", baseKcal: 370 },
  { id: "hard", label: "Hard", description: "Maxing effort", baseKcal: 550 },
];

const GOALS = [
  { id: "lose", label: "Lose weight", delta: -500, description: "~0.5 kg / 1 lb per week" },
  { id: "maintain", label: "Maintain", delta: 0, description: "Stay at current weight" },
  { id: "gain", label: "Gain muscle", delta: 350, description: "Slow lean gain" },
];

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: "Underweight", tone: "bg-brand-accent/30 text-brand-text" };
  if (bmi < 25) return { label: "Healthy weight", tone: "bg-brand-secondary/15 text-brand-secondary-dark" };
  if (bmi < 30) return { label: "Overweight", tone: "bg-brand-accent/30 text-brand-text" };
  return { label: "Obese", tone: "bg-brand-primary/15 text-brand-primary" };
}

function compute(profile) {
  const { age, sex, height_cm, weight_kg, exerciseDays, exerciseType, exerciseIntensity, goal } = profile;
  if (!age || !height_cm || !weight_kg) return null;

  const bmi = weight_kg / Math.pow(height_cm / 100, 2);
  const bmr =
    sex === "female"
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
      : 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;

  // Sedentary baseline
  const baseline = bmr * 1.2;

  // Exercise contribution
  const days = Math.max(0, Math.min(7, parseInt(exerciseDays, 10) || 0));
  const intensity = INTENSITIES.find((i) => i.id === exerciseIntensity) || INTENSITIES[1];
  const type = EXERCISE_TYPES.find((t) => t.id === exerciseType) || EXERCISE_TYPES[3];
  const sessionKcal = intensity.baseKcal * type.mult;
  const dailyExerciseKcal = (days * sessionKcal) / 7;

  const tdee = baseline + dailyExerciseKcal;
  const delta = GOALS.find((g) => g.id === goal)?.delta || 0;
  const targetKcal = Math.max(1200, Math.round(tdee + delta));

  const protein_g = Math.round(weight_kg * 1.8);
  const fat_g = Math.round((targetKcal * 0.27) / 9);
  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const carbs_g = Math.max(0, Math.round((targetKcal - proteinKcal - fatKcal) / 4));

  return {
    bmi: Math.round(bmi * 10) / 10,
    category: bmiCategory(bmi),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    dailyExerciseKcal: Math.round(dailyExerciseKcal),
    targetKcal,
    protein_g,
    fat_g,
    carbs_g,
  };
}

const DEFAULT_PROFILE = {
  age: "",
  sex: "male",
  height_cm: "",
  weight_kg: "",
  exerciseDays: 3,
  exerciseType: "mixed",
  exerciseIntensity: "moderate",
  goal: "maintain",
};

export default function Coach() {
  const { setDailyGoal } = useApp();
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_COACH_PROFILE);
      return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
    } catch { return DEFAULT_PROFILE; }
  });

  useEffect(() => {
    try { localStorage.setItem(LS_COACH_PROFILE, JSON.stringify(profile)); }
    catch { /* ignore */ }
  }, [profile]);

  const result = useMemo(() => {
    const p = {
      ...profile,
      age: parseInt(profile.age, 10) || 0,
      height_cm: parseFloat(profile.height_cm) || 0,
      weight_kg: parseFloat(profile.weight_kg) || 0,
    };
    return compute(p);
  }, [profile]);

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const applyTarget = () => {
    if (!result) return;
    setDailyGoal({
      calories: result.targetKcal,
      protein_g: result.protein_g,
      fat_g: result.fat_g,
      carbs_g: result.carbs_g,
    });
    toast.success("Target applied to your meal log", {
      description: `${result.targetKcal} kcal · ${result.protein_g}g P · ${result.fat_g}g F · ${result.carbs_g}g C`,
    });
  };

  return (
    <div className="space-y-8 md:space-y-10" data-testid="coach-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          Coach
        </p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          What should <span className="italic text-brand-primary">you</span> be eating?
        </h1>
        <p className="text-brand-text-soft max-w-2xl">
          Tell us a bit about yourself &mdash; including exactly how many days you moved
          this week and what you did &mdash; and we&rsquo;ll give you an honest daily calorie
          and macro target.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
        {/* FORM */}
        <div className="bg-white border border-brand-line rounded-3xl p-5 md:p-8 space-y-6">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft flex items-center gap-2">
            <Calculator className="w-3.5 h-3.5" strokeWidth={2} /> About you
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">Age</label>
              <Input data-testid="coach-age" type="number" min="14" max="99" inputMode="numeric"
                value={profile.age} onChange={(e) => set("age", e.target.value)}
                className="rounded-xl border-brand-line h-12 text-base" placeholder="32" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">Sex</label>
              <Select value={profile.sex} onValueChange={(v) => set("sex", v)}>
                <SelectTrigger data-testid="coach-sex" className="rounded-xl border-brand-line bg-white h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">Height (cm)</label>
              <Input data-testid="coach-height" type="number" min="120" max="230" inputMode="decimal"
                value={profile.height_cm} onChange={(e) => set("height_cm", e.target.value)}
                className="rounded-xl border-brand-line h-12 text-base" placeholder="175" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">Weight (kg)</label>
              <Input data-testid="coach-weight" type="number" min="30" max="300" inputMode="decimal"
                value={profile.weight_kg} onChange={(e) => set("weight_kg", e.target.value)}
                className="rounded-xl border-brand-line h-12 text-base" placeholder="72" />
            </div>
          </div>

          {/* Exercise days per week */}
          <div className="space-y-2">
            <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft flex items-center gap-2">
              <Activity className="w-3 h-3" strokeWidth={2} /> Days you exercised this week
            </label>
            <div className="grid grid-cols-8 gap-1.5" data-testid="coach-days-picker">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => {
                const active = profile.exerciseDays === d;
                return (
                  <button
                    key={d}
                    data-testid={`coach-days-${d}`}
                    onClick={() => set("exerciseDays", d)}
                    className={`aspect-square rounded-xl font-semibold text-sm transition-all ${
                      active
                        ? "bg-brand-primary text-white shadow-[0_4px_12px_rgba(224,122,95,0.3)]"
                        : "bg-brand-bg text-brand-text-soft hover:bg-brand-line/60"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exercise type */}
          {profile.exerciseDays > 0 && (
            <div className="space-y-2">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft">
                What did you do?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="coach-type-picker">
                {EXERCISE_TYPES.map((t) => {
                  const active = profile.exerciseType === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      data-testid={`coach-type-${t.id}`}
                      onClick={() => set("exerciseType", t.id)}
                      className={`rounded-2xl px-3 py-3.5 text-sm font-semibold text-left transition-all flex items-center gap-2.5 ${
                        active
                          ? "bg-brand-primary text-white shadow-[0_4px_12px_rgba(224,122,95,0.3)]"
                          : "bg-brand-bg text-brand-text-soft hover:bg-brand-line/60"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intensity */}
          {profile.exerciseDays > 0 && (
            <div className="space-y-2">
              <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft flex items-center gap-2">
                <Zap className="w-3 h-3" strokeWidth={2} /> How hard?
              </label>
              <div className="grid grid-cols-3 gap-2" data-testid="coach-intensity-picker">
                {INTENSITIES.map((it) => {
                  const active = profile.exerciseIntensity === it.id;
                  return (
                    <button
                      key={it.id}
                      data-testid={`coach-intensity-${it.id}`}
                      onClick={() => set("exerciseIntensity", it.id)}
                      className={`rounded-2xl px-2 py-3.5 transition-all ${
                        active
                          ? "bg-brand-primary text-white shadow-[0_4px_12px_rgba(224,122,95,0.3)]"
                          : "bg-brand-bg text-brand-text-soft hover:bg-brand-line/60"
                      }`}
                    >
                      <div className="text-sm font-semibold">{it.label}</div>
                      <div className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-brand-text-soft"}`}>
                        {it.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goal */}
          <div className="space-y-2">
            <label className="text-xs tracking-[0.15em] uppercase font-semibold text-brand-text-soft flex items-center gap-2">
              <Target className="w-3 h-3" strokeWidth={2} /> Your goal
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GOALS.map((g) => {
                const active = profile.goal === g.id;
                return (
                  <button
                    key={g.id}
                    data-testid={`coach-goal-${g.id}`}
                    onClick={() => set("goal", g.id)}
                    className={`rounded-2xl px-2 py-3 text-sm font-semibold text-center transition-all ${
                      active
                        ? "bg-brand-primary text-white shadow-[0_4px_12px_rgba(224,122,95,0.3)]"
                        : "bg-white border border-brand-line text-brand-text-soft hover:border-brand-primary/40 hover:text-brand-text"
                    }`}
                  >
                    <div>{g.label}</div>
                    <div className={`text-[10px] font-normal mt-0.5 leading-tight ${active ? "text-white/80" : "text-brand-text-soft"}`}>
                      {g.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RESULTS */}
        <div className="space-y-6">
          {result ? (
            <>
              <div data-testid="coach-bmi-card" className="bg-white border border-brand-line rounded-3xl p-6 md:p-8 space-y-4">
                <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">Your BMI</p>
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="font-serif-display text-6xl md:text-7xl leading-none font-medium text-brand-primary">
                    {result.bmi}
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${result.category.tone}`}>
                    {result.category.label}
                  </span>
                </div>
                <p className="text-xs text-brand-text-soft italic">
                  BMI is a rough guide only &mdash; it doesn&rsquo;t know how much muscle you carry.
                </p>
                <div className="pt-3 border-t border-brand-line space-y-2 bg-brand-accent/10 -mx-6 md:-mx-8 -mb-6 md:-mb-8 px-6 md:px-8 py-4 rounded-b-3xl">
                  <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text">
                    Medical sources for BMI
                  </p>
                  <ul className="text-sm text-brand-text space-y-1.5">
                    <li>
                      &bull;{" "}
                      <a
                        href="https://www.nhlbi.nih.gov/health/educational/lose_wt/BMI/bmicalc.htm"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary underline font-medium"
                      >
                        U.S. National Institutes of Health &mdash; NHLBI BMI calculator &amp; ranges
                      </a>
                    </li>
                    <li>
                      &bull;{" "}
                      <a
                        href="https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary underline font-medium"
                      >
                        World Health Organization &mdash; Obesity and overweight fact sheet
                      </a>
                    </li>
                    <li>
                      &bull;{" "}
                      <a
                        href="https://www.cdc.gov/bmi/adult-calculator/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary underline font-medium"
                      >
                        U.S. CDC &mdash; Adult BMI calculator &amp; classification
                      </a>
                    </li>
                  </ul>
                  <p className="text-xs text-brand-text-soft italic pt-1">
                    BMI is not a diagnosis. Talk to a clinician for personalised medical advice.
                  </p>
                </div>
              </div>

              <div data-testid="coach-target-card" className="bg-brand-text text-white rounded-3xl p-6 md:p-8 space-y-5 grain relative overflow-hidden">
                <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-brand-primary/25 blur-3xl" />
                <div className="relative space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-accent">
                      To {GOALS.find((g) => g.id === profile.goal)?.label.toLowerCase()}, aim for
                    </p>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span data-testid="coach-target-kcal" className="font-serif-display text-5xl md:text-6xl font-medium text-white leading-none">
                        {result.targetKcal}
                      </span>
                      <span className="text-white/70 text-sm uppercase tracking-[0.18em]">kcal / day</span>
                    </div>
                    <p className="text-xs text-white/50 italic">
                      Maintenance TDEE {result.tdee} kcal &middot; BMR {result.bmr} kcal &middot; exercise adds ~{result.dailyExerciseKcal} kcal/day.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 md:gap-4">
                    {[
                      { l: "protein", v: `${result.protein_g}g` },
                      { l: "fat", v: `${result.fat_g}g` },
                      { l: "carbs", v: `${result.carbs_g}g` },
                    ].map((m) => (
                      <div key={m.l} className="text-center bg-white/8 backdrop-blur-sm rounded-2xl py-4 border border-white/10">
                        <div className="font-serif-display text-2xl md:text-3xl text-white leading-none">{m.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase text-white/60 mt-2">{m.l}</div>
                      </div>
                    ))}
                  </div>

                  <Button
                    data-testid="coach-apply-btn"
                    onClick={applyTarget}
                    className="w-full rounded-full py-6 text-sm font-semibold bg-white text-brand-text hover:bg-brand-accent transition-colors"
                  >
                    <Check className="w-4 h-4 mr-2" strokeWidth={2} />
                    Use this as my daily target
                  </Button>
                </div>
              </div>

              <div className="bg-white border border-brand-line rounded-3xl p-5 space-y-2">
                <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
                  How we calculate this
                </p>
                <p className="text-xs text-brand-text leading-relaxed">
                  Your basal metabolic rate (BMR) uses the{" "}
                  <a
                    href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary underline"
                  >
                    Mifflin-St Jeor equation
                  </a>{" "}
                  (widely used clinical standard). Total daily energy expenditure (TDEE) applies an activity
                  multiplier per the{" "}
                  <a
                    href="https://nap.nationalacademies.org/read/10490/chapter/1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary underline"
                  >
                    U.S. National Academies Dietary Reference Intakes
                  </a>
                  . Macro splits reflect{" "}
                  <a
                    href="https://www.acsm.org/all-blog-posts/certification-blog/acsm-certified-blog/2020/09/16/nutrition-cheat-sheet-fitness-professionals"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary underline"
                  >
                    American College of Sports Medicine
                  </a>{" "}
                  guidance.
                </p>
              </div>

              <p className="text-xs text-brand-text-soft italic">
                Educational estimate only. Not medical advice &mdash; check with a GP or dietician
                if you have specific health goals.
              </p>
            </>
          ) : (
            <div className="bg-white border border-brand-line rounded-3xl p-10 text-center text-brand-text-soft">
              Fill in your details on the left to see your BMI and daily calorie target.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { detectDefaultCountry } from "../lib/retailers";

const AppContext = createContext(null);

const LS_INGREDIENTS = "wcie_ingredients";
const LS_RECIPES = "wcie_recipes";
const LS_SHOPPING = "wcie_shopping";
const LS_COUNTRY = "wcie_country";
const LS_FAVORITES = "manifeast_favorites";
const LS_MEAL_LOG = "manifeast_meal_log";
const LS_DAILY_GOAL = "manifeast_daily_goal";
const LS_GOAL_CELEBRATED = "manifeast_goal_celebrated";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function useLocalStorageSync(key, value, serializer = JSON.stringify) {
  useEffect(() => {
    try {
      localStorage.setItem(key, serializer(value));
    } catch {
      /* localStorage may be full, disabled, or unavailable — silently skip */
    }
  }, [key, value, serializer]);
}

const recipeKey = (r) => r.id || r.title;

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AppProvider({ children }) {
  const [ingredients, setIngredients] = useState(() => readJSON(LS_INGREDIENTS, []));
  const [recipes, setRecipes] = useState(() => readJSON(LS_RECIPES, []));
  const [shoppingList, setShoppingList] = useState(() => readJSON(LS_SHOPPING, []));
  const [favorites, setFavorites] = useState(() => readJSON(LS_FAVORITES, []));
  const [mealLog, setMealLog] = useState(() => readJSON(LS_MEAL_LOG, []));
  const [dailyGoal, setDailyGoal] = useState(() =>
    readJSON(LS_DAILY_GOAL, { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 })
  );
  const [goalCelebratedDate, setGoalCelebratedDate] = useState(() => {
    try { return localStorage.getItem(LS_GOAL_CELEBRATED) || ""; } catch { return ""; }
  });
  const [celebrating, setCelebrating] = useState(false);
  const [country, setCountry] = useState(() => {
    try {
      return localStorage.getItem(LS_COUNTRY) || detectDefaultCountry();
    } catch {
      return "GB";
    }
  });

  useLocalStorageSync(LS_INGREDIENTS, ingredients);
  useLocalStorageSync(LS_RECIPES, recipes);
  useLocalStorageSync(LS_SHOPPING, shoppingList);
  useLocalStorageSync(LS_FAVORITES, favorites);
  useLocalStorageSync(LS_MEAL_LOG, mealLog);
  useLocalStorageSync(LS_DAILY_GOAL, dailyGoal);
  useLocalStorageSync(LS_GOAL_CELEBRATED, goalCelebratedDate, String);
  useLocalStorageSync(LS_COUNTRY, country, String);

  const addShoppingItems = useCallback((items) => {
    setShoppingList((prev) => {
      const set = new Set(prev.map((i) => i.name));
      const merged = [...prev];
      for (const it of items) {
        const name = String(it).trim().toLowerCase();
        if (!name || set.has(name)) continue;
        merged.push({ name, checked: false });
        set.add(name);
      }
      return merged;
    });
  }, []);

  const toggleShoppingItem = useCallback((name) => {
    setShoppingList((prev) =>
      prev.map((i) => (i.name === name ? { ...i, checked: !i.checked } : i))
    );
  }, []);

  const removeShoppingItem = useCallback((name) => {
    setShoppingList((prev) => prev.filter((i) => i.name !== name));
  }, []);

  const clearShopping = useCallback(() => setShoppingList([]), []);

  const toggleFavorite = useCallback((recipe) => {
    setFavorites((prev) => {
      const k = recipeKey(recipe);
      const idx = prev.findIndex((r) => recipeKey(r) === k);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [{ ...recipe, _savedAt: Date.now() }, ...prev];
    });
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map(recipeKey)), [favorites]);
  const isFavorite = useCallback((recipe) => favoriteIds.has(recipeKey(recipe)), [favoriteIds]);

  const addMealToLog = useCallback((analysis) => {
    setMealLog((prev) => [
      { ...analysis, logged_at: new Date().toISOString() },
      ...prev,
    ]);
  }, []);

  const removeMealFromLog = useCallback((id) => {
    setMealLog((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMealLog = useCallback(() => setMealLog([]), []);

  // Goal-met celebration: fires once per day when today's calories cross the target.
  useEffect(() => {
    const target = dailyGoal?.calories || 0;
    if (target <= 0) return;
    const key = todayYmd();
    if (goalCelebratedDate === key) return;

    const todaysKcal = mealLog.reduce((acc, m) => {
      const d = new Date(m.logged_at);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return mk === key ? acc + (m.nutrition?.calories || 0) : acc;
    }, 0);

    if (todaysKcal >= target) {
      setGoalCelebratedDate(key);
      setCelebrating(true);
      toast.success("Daily target met — nice work!", {
        description: `${todaysKcal} of ${target} kcal logged today.`,
        duration: 5000,
      });
      const t = setTimeout(() => setCelebrating(false), 2400);
      return () => clearTimeout(t);
    }
  }, [mealLog, dailyGoal, goalCelebratedDate]);

  const value = useMemo(
    () => ({
      ingredients, setIngredients,
      recipes, setRecipes,
      shoppingList, addShoppingItems, toggleShoppingItem, removeShoppingItem, clearShopping,
      favorites, toggleFavorite, isFavorite,
      mealLog, addMealToLog, removeMealFromLog, clearMealLog,
      dailyGoal, setDailyGoal,
      celebrating,
      country, setCountry,
    }),
    [
      ingredients, recipes, shoppingList, favorites, mealLog, dailyGoal, celebrating, country,
      addShoppingItems, toggleShoppingItem, removeShoppingItem, clearShopping,
      toggleFavorite, isFavorite,
      addMealToLog, removeMealFromLog, clearMealLog,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};

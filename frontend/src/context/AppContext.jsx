import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { detectDefaultCountry } from "../lib/retailers";

const AppContext = createContext(null);

const LS_INGREDIENTS = "wcie_ingredients";
const LS_RECIPES = "wcie_recipes";
const LS_SHOPPING = "wcie_shopping";
const LS_COUNTRY = "wcie_country";

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
    } catch (err) {
      console.warn(`Failed to persist ${key}:`, err);
    }
  }, [key, value, serializer]);
}

export function AppProvider({ children }) {
  const [ingredients, setIngredients] = useState(() => readJSON(LS_INGREDIENTS, []));
  const [recipes, setRecipes] = useState(() => readJSON(LS_RECIPES, []));
  const [shoppingList, setShoppingList] = useState(() => readJSON(LS_SHOPPING, []));
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

  const value = useMemo(
    () => ({
      ingredients,
      setIngredients,
      recipes,
      setRecipes,
      shoppingList,
      addShoppingItems,
      toggleShoppingItem,
      removeShoppingItem,
      clearShopping,
      country,
      setCountry,
    }),
    [
      ingredients,
      recipes,
      shoppingList,
      country,
      addShoppingItems,
      toggleShoppingItem,
      removeShoppingItem,
      clearShopping,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};

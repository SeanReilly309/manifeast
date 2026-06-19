import { createContext, useContext, useEffect, useState } from "react";
import { detectDefaultCountry } from "../lib/retailers";

const AppContext = createContext(null);

const LS_INGREDIENTS = "wcie_ingredients";
const LS_RECIPES = "wcie_recipes";
const LS_SHOPPING = "wcie_shopping";
const LS_COUNTRY = "wcie_country";

export function AppProvider({ children }) {
  const [ingredients, setIngredients] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_INGREDIENTS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [recipes, setRecipes] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_RECIPES);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [shoppingList, setShoppingList] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_SHOPPING);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [country, setCountry] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_COUNTRY);
      return raw || detectDefaultCountry();
    } catch { return "GB"; }
  });

  useEffect(() => {
    localStorage.setItem(LS_INGREDIENTS, JSON.stringify(ingredients));
  }, [ingredients]);
  useEffect(() => {
    localStorage.setItem(LS_RECIPES, JSON.stringify(recipes));
  }, [recipes]);
  useEffect(() => {
    localStorage.setItem(LS_SHOPPING, JSON.stringify(shoppingList));
  }, [shoppingList]);
  useEffect(() => {
    localStorage.setItem(LS_COUNTRY, country);
  }, [country]);

  const addShoppingItems = (items) => {
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
  };

  const toggleShoppingItem = (name) => {
    setShoppingList((prev) =>
      prev.map((i) => (i.name === name ? { ...i, checked: !i.checked } : i))
    );
  };

  const removeShoppingItem = (name) => {
    setShoppingList((prev) => prev.filter((i) => i.name !== name));
  };

  const clearShopping = () => setShoppingList([]);

  return (
    <AppContext.Provider
      value={{
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};

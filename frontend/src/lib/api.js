import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const API_TIMEOUT_MS = 120_000; // 2 min — LLM vision + recipe gen can be slow on flaky iOS networks

const client = axios.create({
  baseURL: API,
  timeout: API_TIMEOUT_MS,
  // iOS WKWebView (Capacitor) aggressively caches API responses. Force fresh
  // fetches every time — critical for shuffle / load-more on the native app.
  headers: {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  },
});

export const scanFridge = async (imageBase64, mimeType = "image/jpeg") => {
  const { data } = await client.post("/scan", {
    image_base64: imageBase64,
    mime_type: mimeType,
  });
  return data;
};

export const suggestRecipes = async (ingredients, maxRecipes = 5) => {
  const { data } = await client.post("/suggest", {
    ingredients,
    max_recipes: maxRecipes,
  });
  return data;
};

export const analyzeMeal = async (imageBase64, mimeType = "image/jpeg") => {
  const { data } = await client.post("/analyze-meal", {
    image_base64: imageBase64,
    mime_type: mimeType,
  });
  return data;
};

export const analyzeMealText = async (description, servings = 1) => {
  const { data } = await client.post("/analyze-meal-text", {
    description,
    servings,
  });
  return data;
};

export const askRecipes = async (query, maxRecipes = 5) => {
  const { data } = await client.post("/ask-recipes", {
    query,
    max_recipes: maxRecipes,
  });
  return data;
};

export const inspireMeals = async (category, coach = null, count = 4, diets = [], refresh = false) => {
  const { data } = await client.post("/inspire", {
    category,
    count,
    coach,
    diets,
    refresh,
  });
  return data;
};

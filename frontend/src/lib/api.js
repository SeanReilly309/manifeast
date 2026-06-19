import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
  timeout: 90000,
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

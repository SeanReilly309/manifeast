// Builds a food-photo URL that best matches a recipe.
// Uses Loremflickr — free, no API key. We keep the query short (primary tag only)
// to maximize the chance of an on-topic match. A hashed seed makes each recipe
// stick to the same image across renders.

const FALLBACK_PHOTOS = [
  "https://images.pexels.com/photos/13294537/pexels-photo-13294537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/33515064/pexels-photo-33515064.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/8142046/pexels-photo-8142046.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Pull the strongest single/pair tag: e.g. "chocolate chip cookies, close up" → "chocolate-chip-cookies"
function primaryTag(input) {
  if (!input) return "";
  const first = input.toLowerCase().split(",")[0].trim();
  return first.replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").slice(0, 40);
}

export function recipeImage(recipe, index = 0, size = { width: 940, height: 700 }) {
  const primary = primaryTag(recipe?.image_query) || primaryTag(recipe?.title);
  if (!primary) return FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length];
  const seed = hashSeed(recipe?.id || recipe?.title || String(index));
  // "food" tag forces the food category; primary tag narrows the dish
  const tags = `food,${primary}`;
  return `https://loremflickr.com/${size.width}/${size.height}/${encodeURIComponent(tags)}/all?lock=${seed}`;
}

// Called by img onError — swaps to a curated fallback if Loremflickr fails.
export function fallbackFoodImage(index = 0) {
  return FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length];
}

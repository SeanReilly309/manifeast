// Builds a food-photo URL that best matches a recipe, plus a stable gradient
// placeholder so cards render instantly while the photo loads (or if it fails).

const FALLBACK_PHOTOS = [
  "https://images.pexels.com/photos/13294537/pexels-photo-13294537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/33515064/pexels-photo-33515064.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/8142046/pexels-photo-8142046.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

// Warm palette that matches Manifeast's brand
const GRADIENTS = [
  "linear-gradient(135deg, #F5C7A3 0%, #E07A5F 100%)", // peach → terracotta
  "linear-gradient(135deg, #C7D6BE 0%, #7B9A7B 100%)", // sage → deep sage
  "linear-gradient(135deg, #F4E4C1 0%, #D4A574 100%)", // cream → honey
  "linear-gradient(135deg, #FBD8B4 0%, #E09E5B 100%)", // sand → amber
  "linear-gradient(135deg, #E8D5C4 0%, #B5825D 100%)", // linen → mocha
  "linear-gradient(135deg, #DCE8CE 0%, #8FA983 100%)", // pistachio → olive
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
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
  const tags = `food,${primary}`;
  return `https://loremflickr.com/${size.width}/${size.height}/${encodeURIComponent(tags)}/all?lock=${seed}`;
}

// Stable warm gradient per recipe — used as an instant background so cards
// render immediately and never show a blank/white flash while the photo loads.
export function recipeGradient(recipe, index = 0) {
  const seed = hashSeed(recipe?.id || recipe?.title || String(index));
  return GRADIENTS[seed % GRADIENTS.length];
}

// Called by img onError — swaps to a curated fallback if Loremflickr fails.
export function fallbackFoodImage(index = 0) {
  return FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length];
}

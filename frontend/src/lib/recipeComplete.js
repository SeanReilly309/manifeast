// Mirrors the backend `_is_cookable` guard so stale on-device copies of a
// recipe (from older app builds) are never used for Recipe Detail / Cook Mode.
export function isCompleteRecipe(r) {
  if (!r || !r.id || !(r.title || "").trim()) return false;
  const ings = Array.isArray(r.ingredients_detailed) ? r.ingredients_detailed : [];
  if (ings.length < 3) return false;
  if (!ings.every((i) => (i?.name || "").trim() && (i?.quantity || "").trim())) return false;
  const steps = Array.isArray(r.steps) ? r.steps.filter((s) => (s?.instruction || "").trim()) : [];
  const legacy = Array.isArray(r.instructions)
    ? r.instructions.filter((t) => typeof t === "string" && t.trim())
    : [];
  return Math.max(steps.length, legacy.length) >= 3;
}

// Tiny utilities that turn a cooking-step string into optional
// UI affordances (an inline timer, a per-step ingredient highlight).

// Match patterns like: "5 min", "10-12 minutes", "about 30 seconds",
// "1 hour 30 minutes". We prefer the LONGEST match so "simmer for
// 25 minutes until reduced" picks 25 min and not 0.
const DURATION_RE = /\b(?:about\s+|around\s+|approx(?:imately)?\s+|~\s*)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|h\b|minutes?|mins?|m\b|seconds?|secs?|s\b)/gi;

/**
 * Extract the first cooking duration from a step string.
 * Returns { label, seconds } or null when none is found.
 *   extractDuration("Simmer for 20 minutes, stirring occasionally") →
 *     { label: "20 min", seconds: 1200 }
 */
export function extractDuration(step) {
  if (!step || typeof step !== "string") return null;
  DURATION_RE.lastIndex = 0;
  const matches = [...step.matchAll(DURATION_RE)];
  if (matches.length === 0) return null;
  // Prefer the largest duration — avoids picking up "5 min rest" over
  // the actual "30 min bake".
  let best = null;
  for (const m of matches) {
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    let seconds = 0;
    if (unit.startsWith("h")) seconds = n * 3600;
    else if (unit.startsWith("m") && unit !== "s") seconds = n * 60;
    else seconds = n;
    // Ignore unreasonably long (>8h) or impossibly short (<10s) outliers —
    // these are usually quantities misread as durations.
    if (seconds < 10 || seconds > 8 * 3600) continue;
    if (!best || seconds > best.seconds) {
      best = { label: humanizeSeconds(seconds), seconds };
    }
  }
  return best;
}

function humanizeSeconds(s) {
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) return `${Math.round(s / 60)} min`;
  return `${s} sec`;
}

/** Format remaining seconds as mm:ss / h:mm:ss for a running timer. */
export function formatTimerClock(remaining) {
  const s = Math.max(0, Math.round(remaining));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// Normalise an ingredient entry (object or string) to a lowercase name.
function nameOf(ing) {
  if (!ing) return "";
  if (typeof ing === "string") return ing.toLowerCase();
  return String(ing.name || ing.ingredient || "").toLowerCase();
}

// Light-touch singularisation so "eggs" matches "egg" in the step.
function singularise(word) {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Return the subset of `ingredientsDetailed` whose name appears in `stepText`.
 * Case-insensitive, naïve word boundary matching, and tolerant of simple
 * plurals ("tomatoes" vs "tomato"). Empty array when nothing matches.
 */
export function ingredientsForStep(stepText, ingredientsDetailed) {
  if (!stepText || !Array.isArray(ingredientsDetailed)) return [];
  const hay = ` ${stepText.toLowerCase()} `;
  const out = [];
  for (const ing of ingredientsDetailed) {
    const name = nameOf(ing);
    if (!name) continue;
    // Match multi-word ingredients as a substring, single words as whole-ish.
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokens = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((t) => t.length > 2);
    const key = tokens[tokens.length - 1] || name;
    const singular = singularise(key);
    const re = new RegExp(`\\b(${esc(key)}|${esc(singular)})s?\\b`, "i");
    if (re.test(hay)) out.push(ing);
  }
  return out;
}

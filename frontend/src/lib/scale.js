// Scale numeric quantities in free-form ingredient/yield strings.
// Handles: integers ("2"), decimals ("1.5"), plain fractions ("3/4"),
// mixed numbers ("1 1/2"), and unicode fractions (¼ ½ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞).

const UNICODE_FRACTIONS = {
  "\u00BC": 1 / 4,
  "\u00BD": 1 / 2,
  "\u00BE": 3 / 4,
  "\u2153": 1 / 3,
  "\u2154": 2 / 3,
  "\u2155": 1 / 5,
  "\u2156": 2 / 5,
  "\u2157": 3 / 5,
  "\u2158": 4 / 5,
  "\u2159": 1 / 6,
  "\u215A": 5 / 6,
  "\u215B": 1 / 8,
  "\u215C": 3 / 8,
  "\u215D": 5 / 8,
  "\u215E": 7 / 8,
};

const CLEAN_FRACTIONS = [
  [1 / 8, "1/8"],
  [1 / 6, "1/6"],
  [1 / 5, "1/5"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [2 / 5, "2/5"],
  [1 / 2, "1/2"],
  [3 / 5, "3/5"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [4 / 5, "4/5"],
  [5 / 6, "5/6"],
  [7 / 8, "7/8"],
];

function formatNumber(n) {
  if (!isFinite(n) || n <= 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  // Find closest clean fraction
  let best = null;
  let bestDiff = Infinity;
  for (const [v, label] of CLEAN_FRACTIONS) {
    const diff = Math.abs(frac - v);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  if (bestDiff <= 0.03) {
    return whole > 0 ? `${whole} ${best}` : best;
  }
  // Fall back to decimal (1 dp), strip trailing zero
  const rounded = Math.round(n * 10) / 10;
  return String(rounded);
}

// Match order matters: mixed number > unicode with leading int > plain fraction >
// unicode alone > decimal > integer.
const TOKEN_REGEX = new RegExp(
  [
    "(\\d+\\s+\\d+\\/\\d+)",              // 1 1/2
    "(\\d+\\s*[\\u00BC\\u00BD\\u00BE\\u2153\\u2154\\u2155\\u2156\\u2157\\u2158\\u2159\\u215A\\u215B\\u215C\\u215D\\u215E])", // 1½
    "(\\d+\\/\\d+)",                      // 3/4
    "([\\u00BC\\u00BD\\u00BE\\u2153\\u2154\\u2155\\u2156\\u2157\\u2158\\u2159\\u215A\\u215B\\u215C\\u215D\\u215E])",         // ½
    "(\\d+\\.\\d+)",                      // 1.5
    "(\\d+)",                             // 2
  ].join("|"),
  "g"
);

function parseToken(tok) {
  const t = tok.trim();
  // Mixed with unicode fraction e.g. "1½"
  const uniMixed = t.match(/^(\d+)\s*([\u00BC-\u00BE\u2153-\u215E])$/);
  if (uniMixed) return parseInt(uniMixed[1], 10) + UNICODE_FRACTIONS[uniMixed[2]];
  // Bare unicode fraction
  if (t.length === 1 && UNICODE_FRACTIONS[t] !== undefined) return UNICODE_FRACTIONS[t];
  // Mixed "1 1/2"
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  // "3/4"
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  // Decimal / int
  const num = parseFloat(t);
  return isNaN(num) ? null : num;
}

export function scaleQuantity(str, factor) {
  if (!str || factor === 1) return str;
  const scaled = String(str).replace(TOKEN_REGEX, (match) => {
    const value = parseToken(match);
    if (value === null) return match;
    return formatNumber(value * factor);
  });
  return pluralizeUnits(scaled);
}

// Pluralize (or de-pluralize) common english measurement units based on the
// preceding numeric value. Only touches full-word units; short units (tsp,
// tbsp, oz, g, ml, kg, l) are left alone.
const UNIT_SINGULAR_TO_PLURAL = {
  cup: "cups",
  tablespoon: "tablespoons",
  teaspoon: "teaspoons",
  ounce: "ounces",
  pound: "pounds",
  pint: "pints",
  quart: "quarts",
  gallon: "gallons",
  stick: "sticks",
  slice: "slices",
  clove: "cloves",
  egg: "eggs",
  sprig: "sprigs",
  sheet: "sheets",
  can: "cans",
  jar: "jars",
  packet: "packets",
  cube: "cubes",
  piece: "pieces",
  leaf: "leaves",
  head: "heads",
  bunch: "bunches",
  stalk: "stalks",
  strip: "strips",
  fillet: "fillets",
};
const UNIT_PLURAL_TO_SINGULAR = Object.fromEntries(
  Object.entries(UNIT_SINGULAR_TO_PLURAL).map(([s, p]) => [p, s])
);
const ALL_UNITS = [
  ...Object.keys(UNIT_SINGULAR_TO_PLURAL),
  ...Object.values(UNIT_SINGULAR_TO_PLURAL),
];
const UNIT_REGEX = new RegExp(
  "(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+)(\\s+)(" +
    ALL_UNITS.join("|") +
    ")\\b",
  "gi"
);

function pluralizeUnits(str) {
  return str.replace(UNIT_REGEX, (_, numStr, ws, unit) => {
    const value = parseToken(numStr);
    if (value === null) return _;
    const lc = unit.toLowerCase();
    const shouldBePlural = value > 1;
    let out = unit;
    if (shouldBePlural && UNIT_SINGULAR_TO_PLURAL[lc]) {
      out = UNIT_SINGULAR_TO_PLURAL[lc];
    } else if (!shouldBePlural && UNIT_PLURAL_TO_SINGULAR[lc]) {
      out = UNIT_PLURAL_TO_SINGULAR[lc];
    }
    // Preserve capitalization of first char (e.g. "Cup" -> "Cups")
    if (unit[0] === unit[0].toUpperCase()) {
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return `${numStr}${ws}${out}`;
  });
}

export function scaleServings(n, factor) {
  if (!n || factor === 1) return n;
  const scaled = n * factor;
  // Servings should stay a whole number where possible
  return scaled < 1 ? Math.max(1, Math.round(scaled * 10) / 10) : Math.max(1, Math.round(scaled));
}

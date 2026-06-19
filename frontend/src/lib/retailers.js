// Retailer deep-link builders for the shopping list.
// Affiliate tags can be plugged into the *_AFFILIATE_TAG constants later.
const TESCO_AFFILIATE = ""; // e.g. "?utm_source=whatcanieat"
const LIDL_AFFILIATE = "";
const AMAZON_AFFILIATE_TAG = ""; // e.g. "tag=whatcanieat-21"

const enc = (s) => encodeURIComponent(String(s).trim());

export const RETAILERS = [
  {
    id: "tesco",
    name: "Tesco",
    color: "#00539F",
    // Tesco grocery search supports multi-word query
    buildBulkUrl: (items) =>
      `https://www.tesco.com/groceries/en-GB/search?query=${enc(items.join(" "))}${TESCO_AFFILIATE}`,
    buildItemUrl: (name) =>
      `https://www.tesco.com/groceries/en-GB/search?query=${enc(name)}${TESCO_AFFILIATE}`,
  },
  {
    id: "lidl",
    name: "Lidl",
    color: "#0050AA",
    buildBulkUrl: (items) =>
      `https://www.lidl.co.uk/q/query/${enc(items.join(" "))}${LIDL_AFFILIATE}`,
    buildItemUrl: (name) =>
      `https://www.lidl.co.uk/q/query/${enc(name)}${LIDL_AFFILIATE}`,
  },
  {
    id: "amazon",
    name: "Amazon Fresh",
    color: "#FF9900",
    buildBulkUrl: (items) => {
      const q = enc(items.join(" "));
      const tag = AMAZON_AFFILIATE_TAG ? `&${AMAZON_AFFILIATE_TAG}` : "";
      return `https://www.amazon.co.uk/s?k=${q}&i=amazonfresh${tag}`;
    },
    buildItemUrl: (name) => {
      const q = enc(name);
      const tag = AMAZON_AFFILIATE_TAG ? `&${AMAZON_AFFILIATE_TAG}` : "";
      return `https://www.amazon.co.uk/s?k=${q}&i=amazonfresh${tag}`;
    },
  },
];

export const getRetailer = (id) => RETAILERS.find((r) => r.id === id);

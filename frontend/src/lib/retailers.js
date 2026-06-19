// Retailer deep-link builders for the shopping list, grouped by country.
// Affiliate tags can be plugged into the *_AFFILIATE_TAG constants later.
const TESCO_AFFILIATE = "";
const SAINSBURYS_AFFILIATE = "";
const LIDL_AFFILIATE = "";
const OCADO_AFFILIATE = "";
const AMAZON_AFFILIATE_TAG = ""; // e.g. "tag=whatcanieat-21"
const INSTACART_AFFILIATE = "";
const WALMART_AFFILIATE = "";

const enc = (s) => encodeURIComponent(String(s).trim());
const amazonTag = AMAZON_AFFILIATE_TAG ? `&${AMAZON_AFFILIATE_TAG}` : "";

const TESCO = {
  id: "tesco",
  name: "Tesco",
  color: "#00539F",
  buildBulkUrl: (items) => `https://www.tesco.com/groceries/en-GB/search?query=${enc(items.join(" "))}${TESCO_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.tesco.com/groceries/en-GB/search?query=${enc(name)}${TESCO_AFFILIATE}`,
};
const SAINSBURYS = {
  id: "sainsburys",
  name: "Sainsbury's",
  color: "#F06C00",
  buildBulkUrl: (items) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc(items.join(" "))}${SAINSBURYS_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc(name)}${SAINSBURYS_AFFILIATE}`,
};
const LIDL = {
  id: "lidl",
  name: "Lidl",
  color: "#0050AA",
  buildBulkUrl: (items) => `https://www.lidl.co.uk/q/query/${enc(items.join(" "))}${LIDL_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.lidl.co.uk/q/query/${enc(name)}${LIDL_AFFILIATE}`,
};
const OCADO = {
  id: "ocado",
  name: "Ocado",
  color: "#6B2C91",
  buildBulkUrl: (items) => `https://www.ocado.com/search?entry=${enc(items.join(" "))}${OCADO_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.ocado.com/search?entry=${enc(name)}${OCADO_AFFILIATE}`,
};
const AMAZON_FRESH_UK = {
  id: "amazon-uk",
  name: "Amazon Fresh",
  color: "#FF9900",
  buildBulkUrl: (items) => `https://www.amazon.co.uk/s?k=${enc(items.join(" "))}&i=amazonfresh${amazonTag}`,
  buildItemUrl: (name) => `https://www.amazon.co.uk/s?k=${enc(name)}&i=amazonfresh${amazonTag}`,
};

const INSTACART = {
  id: "instacart",
  name: "Instacart",
  color: "#43B02A",
  buildBulkUrl: (items) => `https://www.instacart.com/store/s?k=${enc(items.join(" "))}${INSTACART_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.instacart.com/store/s?k=${enc(name)}${INSTACART_AFFILIATE}`,
};
const WALMART = {
  id: "walmart",
  name: "Walmart",
  color: "#0071CE",
  buildBulkUrl: (items) => `https://www.walmart.com/search?q=${enc(items.join(" "))}${WALMART_AFFILIATE}`,
  buildItemUrl: (name) => `https://www.walmart.com/search?q=${enc(name)}${WALMART_AFFILIATE}`,
};
const AMAZON_FRESH_US = {
  id: "amazon-us",
  name: "Amazon Fresh",
  color: "#FF9900",
  buildBulkUrl: (items) => `https://www.amazon.com/s?k=${enc(items.join(" "))}&i=amazonfresh${amazonTag}`,
  buildItemUrl: (name) => `https://www.amazon.com/s?k=${enc(name)}&i=amazonfresh${amazonTag}`,
};
const WHOLE_FOODS = {
  id: "wholefoods",
  name: "Whole Foods",
  color: "#006F46",
  buildBulkUrl: (items) => `https://www.amazon.com/s?k=${enc(items.join(" "))}&i=wholefoods${amazonTag}`,
  buildItemUrl: (name) => `https://www.amazon.com/s?k=${enc(name)}&i=wholefoods${amazonTag}`,
};

export const COUNTRIES = [
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", retailers: [TESCO, SAINSBURYS, LIDL, OCADO, AMAZON_FRESH_UK] },
  { code: "US", name: "United States", flag: "🇺🇸", retailers: [INSTACART, WALMART, AMAZON_FRESH_US, WHOLE_FOODS] },
];

export const getCountry = (code) => COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];

export const detectDefaultCountry = () => {
  try {
    const lang = (navigator.language || "en-GB").toUpperCase();
    if (lang.endsWith("-US") || lang === "EN-US") return "US";
  } catch { /* ignore */ }
  return "GB";
};

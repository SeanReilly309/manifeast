// Encode/decode a shopping list (or single item) into a shareable URL fragment.
//
// The payload lives in the URL hash so it never hits our servers — every user
// device is the sole storage. We use base64url (URL-safe) of a compact JSON
// object so the link stays copy-friendly across iMessage, WhatsApp, and email.

const PAYLOAD_VERSION = 1;

function toBase64Url(str) {
  // btoa needs binary/ASCII; convert unicode via encodeURIComponent first.
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encode a list of item names into a URL-safe token for #import. */
export function encodeShoppingPayload(items) {
  const clean = (Array.isArray(items) ? items : [])
    .map((i) => (typeof i === "string" ? i : i?.name || ""))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 60); // guard: keep URLs short
  const payload = { v: PAYLOAD_VERSION, items: clean };
  return toBase64Url(JSON.stringify(payload));
}

/** Decode a token back into a plain list of item name strings. */
export function decodeShoppingPayload(token) {
  if (!token || typeof token !== "string") return [];
  try {
    const json = fromBase64Url(token);
    const parsed = JSON.parse(json);
    if (!parsed || parsed.v !== PAYLOAD_VERSION) return [];
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items
      .filter((s) => typeof s === "string")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 60);
  } catch {
    return [];
  }
}

/** Build the full shareable URL for a given list of items. */
export function buildShareUrl(items) {
  const token = encodeShoppingPayload(items);
  // Use window.location.origin so this Just Works on preview / prod / iOS
  // Capacitor (which loads the bundled app but universal links open in Safari).
  const base = typeof window !== "undefined" && window.location
    ? window.location.origin
    : "https://manifest.ie";
  return `${base}/shop/import#${token}`;
}

/**
 * Open the native share sheet if available, else copy the link to clipboard.
 * Returns { method: 'share' | 'clipboard' | 'error' } for the caller to toast.
 */
export async function shareShoppingItems(items, { singleItem = false } = {}) {
  const url = buildShareUrl(items);
  const list = Array.isArray(items) ? items : [];
  const title = singleItem && list.length === 1
    ? `Grab "${list[0]}" for me?`
    : `My Manifeast shopping list (${list.length} item${list.length === 1 ? "" : "s"})`;
  const text = singleItem && list.length === 1
    ? `Can you grab "${list[0]}"? Tap to add it to your Manifeast list:`
    : `Tap to add these to your Manifeast shopping list:`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return { method: "share", url };
    } catch (err) {
      // User cancelled or share sheet unavailable — fall through to clipboard.
      if (err && err.name === "AbortError") return { method: "cancelled", url };
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { method: "clipboard", url };
    } catch {
      // fall through
    }
  }
  return { method: "error", url };
}

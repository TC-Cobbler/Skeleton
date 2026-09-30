// Colour helpers for the colour picker (T4.3, T4.7): the native picker speaks hex,
// the tokens speak oklch.

/** `#3366cc` → `oklch(0.534 0.157 262.3)`, keeping `alpha` (e.g. " / 10%") if given. */
export function hexToOklch(hex: string, alpha = ""): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => toLinear(parseInt(h as string, 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = C < 0.0005 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return `oklch(${fmt(L, 3)} ${C < 0.0005 ? 0 : fmt(C, 3)} ${fmt(h, 1)}${alpha})`;
}

/** The alpha part of a colour function, e.g. " / 10%" from `oklch(1 0 0 / 10%)`; "" when opaque. */
export function alphaOf(value: string): string {
  const m = /\s*\/\s*([\d.]+%?)\s*\)\s*$/.exec(value);
  return m ? ` / ${m[1]}` : "";
}

/** Any CSS colour → `#rrggbb`, through the browser's own parser; null if it isn't one. */
export function cssToHex(css: string): string | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = css;
  if (ctx.fillStyle === "#010203" && css.trim().toLowerCase() !== "#010203") return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

/** The CSS property each colour utility sets. */
export const COLOUR_PROPERTY: Record<string, string> = { bg: "background-color", text: "color", border: "border-color" };

/**
 * Classes of one colour utility, so an instance colour replaces the one there:
 * `text-primary`, `text-[#fff]`, but never `text-sm` or `border-2`.
 */
export const COLOUR_GROUP: Record<string, string> = {
  bg: "^bg-([a-z]+(-[a-z0-9]+)*(\\/\\d+)?|\\[#[0-9a-fA-F]+\\])$",
  text: "^text-(?!(xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$)([a-z]+(-[a-z0-9]+)*(\\/\\d+)?|\\[#[0-9a-fA-F]+\\])$",
  border: "^border-(?!(\\d+|[xytrblse]|[xytrblse]-\\d+|solid|dashed|dotted|double|none|hidden)$)([a-z]+(-[a-z0-9]+)*(\\/\\d+)?|\\[#[0-9a-fA-F]+\\])$",
};

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fmt(n: number, places: number): string {
  return String(Math.round(n * 10 ** places) / 10 ** places);
}

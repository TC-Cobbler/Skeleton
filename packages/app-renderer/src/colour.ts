// Colour helpers for the colour picker (T4.3, T4.7): the picker speaks hex, RGB, HSL
// and HSV, the tokens speak oklch.

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

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#3366cc` or `#36c` → { r: 51, g: 102, b: 204 }; null if it isn't a hex colour. */
export function hexToRgb(hex: string): Rgb | null {
  const t = hex.trim().replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/i.test(t) ? t.replace(/./g, (c) => c + c) : t;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

/** { r, g, b } (0–255, clamped and rounded) → `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/** RGB → hue (0–360), saturation and lightness (0–100). */
export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(rr, gg, bb, max, d), s: s * 100, l: l * 100 };
}

/** Hue (0–360), saturation and lightness (0–100) → RGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  return fromChroma(h, c, ll - c / 2);
}

/** RGB → hue (0–360), saturation and value (0–100): the picker area's axes. */
export function rgbToHsv({ r, g, b }: Rgb): { h: number; s: number; v: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  return { h: hueOf(rr, gg, bb, max, d), s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

/** Hue (0–360), saturation and value (0–100) → RGB. */
export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const vv = clamp(v, 0, 100) / 100;
  const c = vv * (clamp(s, 0, 100) / 100);
  return fromChroma(h, c, vv - c);
}

/** Opacity (0–100) from a colour's alpha part (" / 10%" or " / 0.1"); 100 when opaque. */
export function opacityOf(alpha: string): number {
  const m = /([\d.]+)(%?)/.exec(alpha);
  if (!m) return 100;
  const n = Number(m[1]);
  return clamp(m[2] ? n : n * 100, 0, 100);
}

/** The alpha part for an opacity (0–100): "" when opaque, else " / 40%". */
export function alphaFor(opacity: number): string {
  const o = clamp(Math.round(opacity), 0, 100);
  return o >= 100 ? "" : ` / ${o}%`;
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function fromChroma(h: number, c: number, m: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// CSS colours as points in OKLab, for finding the nearest colour token (T4.6).

export interface Oklab {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

/** Parse hex, rgb()/rgba(), oklch(), black, white and transparent; null for anything else. */
export function parseColour(css: string): Oklab | null {
  const value = css.trim().toLowerCase();
  if (value === "black") return fromSrgb(0, 0, 0, 1);
  if (value === "white") return fromSrgb(1, 1, 1, 1);
  if (value === "transparent") return { L: 0, a: 0, b: 0, alpha: 0 };
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (m) {
    const hex = m[1] as string;
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return fromSrgb(n(0), n(2), n(4), full.length === 8 ? n(6) : 1);
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (m) {
    const channel = (s: string) => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s) / 255);
    return fromSrgb(channel(m[1] as string), channel(m[2] as string), channel(m[3] as string), alphaOf(m[4]));
  }
  m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (m) {
    const L = (m[1] as string).endsWith("%") ? parseFloat(m[1] as string) / 100 : parseFloat(m[1] as string);
    const C = parseFloat(m[2] as string);
    const h = (parseFloat(m[3] as string) * Math.PI) / 180;
    return { L, a: C * Math.cos(h), b: C * Math.sin(h), alpha: alphaOf(m[4]) };
  }
  return null;
}

/** Perceptual distance (ΔE in OKLab, alpha weighted like a channel). */
export function colourDistance(x: Oklab, y: Oklab): number {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b, x.alpha - y.alpha);
}

function alphaOf(s: string | undefined): number {
  if (s === undefined) return 1;
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}

function fromSrgb(r: number, g: number, b: number, alpha: number): Oklab {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha,
  };
}

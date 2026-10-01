// The violations panel (T4.6): each violation with its element, the property it
// overrides and the nearest token, and the fixes: snap to that token, or promote
// the value to a new token. Pure; main reads the files and writes the results.

import { tryEvaluate } from "./calc.js";
import { colourDistance, parseColour } from "./colour.js";
import { isPlumbing, lookupFor } from "./theme.js";
import { readTokens, writeTokens, TokenError, type TokenUpdate } from "./tokens.js";
import { reason } from "./reasons.js";
import { buildTree, walkTree, type UiNode } from "./tree.js";
import { COLOUR_PREFIXES, RADIUS_SIDES, SPACING_PREFIXES } from "./utilities.js";
import { findViolations, stripVariants, type Violation } from "./violations.js";

export type ViolationProperty = "radius" | "spacing" | "font-size" | "border-width" | "colour" | "style" | "other";

/** The kind of token an override can be promoted to. */
export type PromoteKind = "radius" | "spacing" | "text" | "colour";

export interface ViolationDetail extends Violation {
  /** The innermost page element it's on, if the page's tree reaches it. */
  element: { id: string | null; name: string } | null;
  property: ViolationProperty;
  /**
   * It's a class in the literal className of an editable element with an ID, so a
   * fix is one `setClass` there. Otherwise it's agent code (or inline style): keep only.
   */
  editable: boolean;
  /** The token to snap to: the replacement class (variants kept) and what it comes to. */
  nearest: { utility: string; token: string; value: string } | null;
  promote: PromoteKind | null;
}

/** What the fixes need to know about the project's design system. */
export interface DesignContext {
  /** The project's globals.css. */
  css: string;
  /** Tailwind's own palette (`--color-red-500` → value), from its theme.css; for `bg-red-500`. */
  palette: Record<string, string>;
  /** px per rem (16 unless the project changes the root font size). */
  rootPx?: number;
}

/** A value a violating class sets, as a length or a colour. */
interface Parsed {
  property: ViolationProperty;
  /** The utility without its value: `rounded-tl`, `-mt`, `bg`. */
  prefix: string;
  px: number | null;
  colour: string | null;
  /** `/50` on colours. */
  opacity: string;
}

const LENGTH = /^(-?\d*\.?\d+)(px|rem)$/;

export function describeViolations(source: string, file: string, ctx: DesignContext): ViolationDetail[] {
  const violations = findViolations(source, file);
  if (violations.length === 0) return [];
  const nodes: UiNode[] = [];
  walkTree(buildTree(source).roots, (n) => void nodes.push(n));
  const rootPx = ctx.rootPx ?? 16;
  const tokens = readTokens(ctx.css);
  const lookup = lookupFor(tokens);
  const pxOf = (value: string) => {
    const q = tryEvaluate(value, lookup, rootPx);
    return q && q.unit === "px" ? q.value : null;
  };
  return violations.map((v) => {
    const node = innermost(nodes, v.offset);
    const detail: ViolationDetail = {
      ...v,
      element: node ? { id: node.id, name: node.name } : null,
      property: v.kind === "inline-style" ? "style" : "other",
      editable: false,
      nearest: null,
      promote: null,
    };
    if (v.kind === "inline-style") return detail;
    const classes = node && typeof node.props["className"] === "string" ? node.props["className"].split(/\s+/) : [];
    detail.editable =
      node !== null && node.kind !== "locked" && node.id !== null && !node.protectedProps.includes("className") && classes.includes(v.value);
    const base = stripVariants(v.value);
    const important = base.startsWith("!") ? "!" : "";
    const variants = v.value.slice(0, v.value.length - base.length);
    const parsed = parseUtility(base.replace(/^!/, ""), ctx.palette, rootPx);
    if (!parsed) return detail;
    detail.property = parsed.property;
    const utility = (u: string) => `${variants}${important}${u}`;
    switch (parsed.property) {
      case "radius": {
        const best = nearestLength(tokens, /^--radius-(.+)$/, parsed.px, pxOf);
        if (best) detail.nearest = { utility: utility(`${parsed.prefix}-${best.name}`), token: best.token, value: `${round(best.px)}px` };
        detail.promote = parsed.px !== null ? "radius" : null;
        break;
      }
      case "font-size": {
        const best = nearestLength(tokens, /^--text-(xs|sm|base|lg|xl|[2-9]xl)$/, parsed.px, pxOf);
        if (best) detail.nearest = { utility: utility(`text-${best.name}`), token: best.token, value: `${round(best.px)}px` };
        detail.promote = parsed.px !== null ? "text" : null;
        break;
      }
      case "spacing": {
        const spacing = pxOf("var(--spacing)");
        if (parsed.px !== null && spacing !== null && spacing > 0) {
          const step = Math.round((Math.abs(parsed.px) / spacing) * 2) / 2;
          const sign = parsed.px < 0 && step > 0 ? "-" : "";
          const prefix = parsed.prefix.replace(/^-/, "");
          detail.nearest = { utility: utility(`${sign}${prefix}-${step}`), token: "--spacing", value: `${sign}${round(step * spacing)}px` };
        }
        detail.promote = parsed.px !== null && parsed.px >= 0 ? "spacing" : null;
        break;
      }
      case "border-width": {
        const width = pxOf("var(--border-width)");
        if (width !== null) detail.nearest = { utility: utility(parsed.prefix), token: "--border-width", value: `${round(width)}px` };
        break;
      }
      case "colour": {
        const target = parsed.colour ? parseColour(parsed.colour) : null;
        if (target) {
          let best: { name: string; distance: number } | null = null;
          for (const t of tokens) {
            if (t.block !== "light") continue;
            const c = parseColour(t.value);
            if (!c) continue;
            const distance = colourDistance(c, target);
            if (!best || distance < best.distance) best = { name: t.name, distance };
          }
          if (best) detail.nearest = { utility: utility(`${parsed.prefix}-${best.name.slice(2)}${parsed.opacity}`), token: best.name, value: lookup(best.name) ?? "" };
          detail.promote = "colour";
        }
        break;
      }
      case "style":
      case "other":
        break;
    }
    return detail;
  });
}

/** Name for a promoted token: lowercase letters, digits and dashes, starting with a letter. */
export const TOKEN_NAME = /^[a-z][a-z0-9-]{0,30}$/;

/**
 * Promote an override to a new token named `name` (T4.6): the token (and, for a
 * colour, its light and dark values and Tailwind name) is created in globals.css, and
 * the class to replace the override with is returned.
 */
export function promoteViolation(css: string, detail: ViolationDetail, name: string, ctx: Omit<DesignContext, "css">): { css: string; utility: string } {
  if (!TOKEN_NAME.test(name)) throw new TokenError(`"${name}" can't name a token: use lowercase letters, digits and dashes`);
  const base = stripVariants(detail.value);
  const variants = detail.value.slice(0, detail.value.length - base.length);
  const important = base.startsWith("!") ? "!" : "";
  const rootPx = ctx.rootPx ?? 16;
  const parsed = parseUtility(base.replace(/^!/, ""), ctx.palette, rootPx);
  if (!parsed || !detail.promote) throw new TokenError(`${detail.value} can't be promoted to a token`);
  const rem = (px: number) => `${Math.round((px / rootPx) * 10_000) / 10_000}rem`;
  let updates: TokenUpdate[];
  let utility: string;
  switch (detail.promote) {
    case "radius":
      updates = [{ name: `--radius-${name}`, value: rem(parsed.px ?? 0), block: "theme-inline", create: true }];
      utility = `${parsed.prefix}-${name}`;
      break;
    case "text":
      updates = [{ name: `--text-${name}`, value: rem(parsed.px ?? 0), block: "theme-inline", create: true }];
      utility = `text-${name}`;
      break;
    case "spacing":
      updates = [{ name: `--spacing-${name}`, value: rem(parsed.px ?? 0), block: "theme", create: true }];
      utility = `${parsed.prefix}-${name}`;
      break;
    case "colour": {
      const value = parsed.colour ?? "";
      updates = [
        { name: `--${name}`, value, block: "light", create: true },
        { name: `--${name}`, value, block: "dark", create: true },
        { name: `--color-${name}`, value: `var(--${name})`, block: "theme-inline", create: true },
      ];
      utility = `${parsed.prefix}-${name}${parsed.opacity}`;
      break;
    }
  }
  const taken = readTokens(css);
  for (const u of updates) {
    if (taken.some((t) => t.name === u.name)) throw new TokenError(`${u.name} already exists; pick another name`, { reason: reason("theme-name-taken", { name: u.name }) });
  }
  return { css: writeTokens(css, updates), utility: `${variants}${important}${utility}` };
}

/** Custom properties in Tailwind's theme.css (`@theme default { … }`), for palette colours. */
export function readPalette(themeCss: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of themeCss.matchAll(/(--color-[a-z]+(?:-\d+)?)\s*:\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).trim();
  return out;
}

function parseUtility(base: string, palette: Record<string, string>, rootPx: number): Parsed | null {
  const length = (s: string) => {
    const m = LENGTH.exec(s);
    return m ? Number(m[1]) * (m[2] === "rem" ? rootPx : 1) : null;
  };
  const arbitrary = /^(-?[a-z][a-z0-9-]*?)-\[(.+)\](\/\d+)?$/.exec(base);
  if (arbitrary) {
    const prefix = arbitrary[1] as string;
    const inner = (arbitrary[2] as string).replace(/_/g, " ");
    const px = length(inner);
    const colour = parseColour(inner) ? inner : null;
    if (new RegExp(`^rounded(-(${RADIUS_SIDES}))?$`).test(prefix)) return { property: "radius", prefix, px, colour: null, opacity: "" };
    if (prefix === "text" && px !== null) return { property: "font-size", prefix, px, colour: null, opacity: "" };
    if (/^border(-[xytrblse])?$/.test(prefix) && px !== null) return { property: "border-width", prefix, px, colour: null, opacity: "" };
    if (colour && new RegExp(`^(${COLOUR_PREFIXES})$`).test(prefix)) return { property: "colour", prefix, px: null, colour, opacity: arbitrary[3] ?? "" };
    if (new RegExp(`^-?(${SPACING_PREFIXES})$`).test(prefix)) return { property: "spacing", prefix, px: px !== null && prefix.startsWith("-") ? -px : px, colour: null, opacity: "" };
    return { property: "other", prefix, px, colour, opacity: "" };
  }
  const named = new RegExp(`^(${COLOUR_PREFIXES})-([a-z]+-\\d{2,3}|black|white)(\\/\\d+)?$`).exec(base);
  if (named) return { property: "colour", prefix: named[1] as string, px: null, colour: palette[`--color-${named[2]}`] ?? named[2] ?? null, opacity: named[3] ?? "" };
  return null;
}

function nearestLength(
  tokens: ReturnType<typeof readTokens>,
  pattern: RegExp,
  px: number | null,
  pxOf: (value: string) => number | null,
): { name: string; token: string; px: number } | null {
  if (px === null) return null;
  let best: { name: string; token: string; px: number } | null = null;
  for (const t of tokens) {
    const m = pattern.exec(t.name);
    if (!m || t.block === "dark" || isPlumbing(t)) continue;
    const value = pxOf(`var(${t.name})`);
    if (value === null) continue;
    if (!best || Math.abs(value - px) < Math.abs(best.px - px)) best = { name: m[1] as string, token: t.name, px: value };
  }
  return best;
}

function innermost(nodes: UiNode[], offset: number): UiNode | null {
  let best: UiNode | null = null;
  for (const n of nodes) {
    if (!n.element || offset < n.range.start || offset >= n.range.end) continue;
    if (!best || n.range.end - n.range.start < best.range.end - best.range.start) best = n;
  }
  return best;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

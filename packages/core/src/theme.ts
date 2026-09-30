// The design tokens as the token panel shows them (T4.1): one entry per token with
// its light and dark values, the formula it's derived by, and what that comes to.
// Reading only; every write goes through the token writer (tokens.ts).

import { formatQuantity, referencedTokens, tryEvaluate, type TokenLookup } from "./calc.js";
import { readTokens, writeTokens, TokenError, type Token, type TokenBlock } from "./tokens.js";

export type TokenGroup = "radius" | "spacing" | "type" | "font" | "colour" | "border";

export type ColourMode = "light" | "dark";

export interface ThemeToken {
  name: string;
  group: TokenGroup;
  /** Where the (light or only) value lives. */
  block: Exclude<TokenBlock, "dark">;
  /** The value as written in `block`. */
  value: string;
  /** The `.dark` value, for colours; null when the token has none. */
  dark: string | null;
  /** Tokens the value refers to (`var(--radius)`): non-empty means derived. */
  references: string[];
  /** What the value comes to, e.g. "0.5rem"; null when it isn't a single length or number. */
  resolved: string | null;
  /**
   * The template's value for this token when that is a formula, else null. A token
   * with a default formula but no references has been detached, and can be re-attached.
   */
  defaultFormula: string | null;
}

export interface Theme {
  tokens: ThemeToken[];
}

/**
 * Tailwind plumbing in `@theme inline`: `--color-primary: var(--primary)` and
 * `--default-border-width: var(--border-width)` only hand a token to Tailwind, so
 * they aren't shown as tokens of their own (their source token is).
 */
export function isPlumbing(token: Token): boolean {
  if (token.block !== "theme-inline") return false;
  if (token.name === "--default-border-width") return true;
  const m = /^--color-(.+)$/.exec(token.name);
  return m !== null && token.value.trim() === `var(--${m[1]})`;
}

export function groupOf(name: string): TokenGroup {
  if (name.startsWith("--radius")) return "radius";
  if (name === "--spacing" || name.startsWith("--spacing-")) return "spacing";
  if (name.startsWith("--type-") || name.startsWith("--text-")) return "type";
  if (name.startsWith("--font-")) return "font";
  if (name === "--border-width") return "border";
  return "colour";
}

/** A lookup of each token's value in `mode`: `.dark` values win in dark mode. */
export function lookupFor(tokens: readonly Token[], mode: ColourMode = "light"): TokenLookup {
  const values = new Map<string, string>();
  for (const t of tokens) if (t.block !== "dark" && !values.has(t.name)) values.set(t.name, t.value);
  if (mode === "dark") for (const t of tokens) if (t.block === "dark") values.set(t.name, t.value);
  return (name) => values.get(name) ?? null;
}

/**
 * The token panel's view of globals.css. `defaults` are the template's tokens, for
 * re-attaching a detached token to its formula.
 */
export function readTheme(css: string, defaults: readonly Token[] = []): Theme {
  const raw = readTokens(css);
  const lookup = lookupFor(raw);
  const out: ThemeToken[] = [];
  for (const token of raw) {
    if (token.block === "dark" || isPlumbing(token) || out.some((t) => t.name === token.name)) continue;
    const references = referencedTokens(token.value);
    const q = references.length > 0 ? tryEvaluate(token.value, lookup) : null;
    const fallback = defaults.find((d) => d.name === token.name && d.block === token.block)?.value ?? null;
    out.push({
      name: token.name,
      group: groupOf(token.name),
      block: token.block,
      value: token.value,
      dark: raw.find((t) => t.name === token.name && t.block === "dark")?.value ?? null,
      references,
      resolved: q ? formatQuantity(q) : null,
      defaultFormula: fallback !== null && referencedTokens(fallback).length > 0 ? fallback : null,
    });
  }
  return { tokens: out };
}

/**
 * Every token whose value depends on `name`, directly or through other tokens
 * (plumbing included), nearest first. `--radius` → `--radius-button`, …
 */
export function dependentsOf(tokens: readonly Token[], name: string): string[] {
  const out: string[] = [];
  const queue = [name];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const t of tokens) {
      if (t.name === name || out.includes(t.name)) continue;
      if (referencedTokens(t.value).includes(current)) {
        out.push(t.name);
        queue.push(t.name);
      }
    }
  }
  return out;
}

/** A write to one token, in the mode it applies to. */
export interface TokenWrite {
  name: string;
  value: string;
  /** "dark" writes the `.dark` value; "light" (or null) the token's own block. */
  mode: ColourMode | null;
}

/**
 * Set token values through the token writer. A dark write needs the token to have a
 * `.dark` value already; a light write targets the block the token lives in besides
 * `.dark`. Only the targeted declarations change.
 */
export function setTokens(css: string, writes: readonly TokenWrite[]): string {
  const raw = readTokens(css);
  return writeTokens(
    css,
    writes.map((w) => {
      if (w.mode === "dark") {
        if (!raw.some((t) => t.name === w.name && t.block === "dark")) throw new TokenError(`${w.name} has no dark value`);
        return { name: w.name, value: w.value, block: "dark" as const };
      }
      const home = raw.find((t) => t.name === w.name && t.block !== "dark");
      if (!home) throw new TokenError(`${w.name} not found`);
      return { name: w.name, value: w.value, block: home.block };
    }),
  );
}

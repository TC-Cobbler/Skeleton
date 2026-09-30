// Which Tailwind utilities a token drives (T4.2): a token affects every element
// carrying a utility that reads it, directly or through the tokens derived from it.
// Pure knowledge of Tailwind v4's theme namespaces; the overlay matches the result
// against the rendered DOM's classes (after stripping variants such as `hover:`).

import postcss from "postcss";
import { dependentsOf } from "./theme.js";
import { readTokens, type Token } from "./tokens.js";

export interface TokenUsage {
  /** Regex sources, each matching a whole base utility (variants stripped) that reads the token. */
  classes: string[];
  /** CSS selectors the stylesheet's base layer styles with the token (e.g. `body`). */
  selectors: string[];
}

export const COLOUR_PREFIXES =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow|inset-shadow|inset-ring";
export const RADIUS_SIDES = "t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee";
export const SPACING_PREFIXES =
  "p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|start|end|translate-x|translate-y|indent|basis|scroll-m|scroll-p";
/** Utilities that set a border width without naming one: they read `--default-border-width`. */
const BORDER_WIDTH = "(border|border-[xytrblse]|divide-x|divide-y)";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Utilities reading one Tailwind theme variable, by its namespace. */
export function utilitiesFor(variable: string): string[] {
  let m: RegExpExecArray | null;
  if ((m = /^--color-(.+)$/.exec(variable))) return [`^-?(${COLOUR_PREFIXES})-${escapeRe(m[1] as string)}(\\/[\\w.%-]+)?$`];
  if ((m = /^--radius-(.+)$/.exec(variable))) return [`^rounded(-(${RADIUS_SIDES}))?-${escapeRe(m[1] as string)}$`];
  if ((m = /^--text-(.+)$/.exec(variable))) return [`^text-${escapeRe(m[1] as string)}(\\/[\\w.-]+)?$`];
  if ((m = /^--font-(.+)$/.exec(variable))) return [`^font-${escapeRe(m[1] as string)}$`];
  if (variable === "--spacing") return [`^-?(${SPACING_PREFIXES})-\\d+(\\.\\d+)?$`];
  if (variable === "--default-border-width") return [`^${BORDER_WIDTH}$`];
  return [];
}

/**
 * What each token affects, keyed by name: the utilities reading it or anything
 * derived from it, and the base-layer selectors styled with those utilities.
 */
export function tokenUsage(css: string): Record<string, TokenUsage> {
  const tokens = readTokens(css);
  const base = baseRules(css);
  const out: Record<string, TokenUsage> = {};
  for (const token of tokens) {
    if (token.block === "dark" || out[token.name]) continue;
    out[token.name] = usageOf(tokens, token.name, base);
  }
  return out;
}

function usageOf(tokens: readonly Token[], name: string, base: BaseRule[]): TokenUsage {
  const classes: string[] = [];
  for (const variable of [name, ...dependentsOf(tokens, name)]) {
    for (const re of utilitiesFor(variable)) if (!classes.includes(re)) classes.push(re);
  }
  const selectors: string[] = [];
  const matchers = classes.map((c) => new RegExp(c));
  for (const rule of base) {
    const applied = rule.utilities.filter((u) => matchers.some((re) => re.test(u)));
    if (applied.length === 0) continue;
    if (rule.selector === "*") {
      // `* { @apply border-border }`: the colour reaches every element that has a border.
      if (applied.some((u) => /^border-/.test(u))) {
        const widths = `^${BORDER_WIDTH}(-\\d+)?$`;
        if (!classes.includes(widths)) classes.push(widths);
      }
      continue;
    }
    if (!selectors.includes(rule.selector)) selectors.push(rule.selector);
  }
  return { classes, selectors };
}

interface BaseRule {
  selector: string;
  utilities: string[];
}

/** `@layer base { body { @apply bg-background … } }` → the utilities each selector applies. */
function baseRules(css: string): BaseRule[] {
  const out: BaseRule[] = [];
  postcss.parse(css).walkAtRules("layer", (layer) => {
    if (layer.params.trim() !== "base") return;
    layer.walkRules((rule) => {
      const utilities: string[] = [];
      rule.each((node) => {
        if (node.type === "atrule" && node.name === "apply") {
          for (const u of node.params.split(/\s+/).filter(Boolean)) utilities.push(u.replace(/^!/, ""));
        }
      });
      if (utilities.length > 0) for (const selector of rule.selectors) out.push({ selector: selector.trim(), utilities });
    });
  });
  return out;
}

// Which rendered elements each token affects (T4.2). The host sends, per token, the
// utilities that read it and the base-layer selectors it styles (worked out in
// core); this matches them against the live DOM, so custom components and shadcn
// internals count too.

import type { TokenUsage } from "./protocol.js";

interface Compiled {
  name: string;
  classes: RegExp[];
  selectors: string[];
}

export class TokenMatcher {
  private readonly compiled: Compiled[];

  /** `probe` checks selectors once, so matching never throws. */
  constructor(usage: Record<string, TokenUsage>, probe: Element) {
    this.compiled = Object.entries(usage).map(([name, u]) => ({
      name,
      classes: u.classes.flatMap((source) => {
        try {
          return [new RegExp(source)];
        } catch (error) {
          console.warn(`[skeleton overlay] bad utility pattern for ${name}`, error);
          return [];
        }
      }),
      selectors: u.selectors.filter((selector) => {
        try {
          probe.matches(selector);
          return true;
        } catch (error) {
          console.warn(`[skeleton overlay] ${name}: ignoring selector ${selector}`, error);
          return false;
        }
      }),
    }));
  }

  /** Tokens the element is styled with, by its own classes (variants included) or a base selector. */
  tokensOf(el: Element): string[] {
    const utilities = baseUtilities(el);
    return this.compiled.filter((c) => affects(c, el, utilities)).map((c) => c.name);
  }

  /** How many elements under `root` (itself included) each token affects. */
  count(root: Element, skip: Element | null): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of this.compiled) counts[c.name] = 0;
    for (const el of elementsUnder(root, skip)) {
      for (const name of this.tokensOf(el)) counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  }

  /** The elements under `root` that `name` affects, in document order. */
  elements(root: Element, skip: Element | null, name: string, limit = 500): Element[] {
    const c = this.compiled.find((x) => x.name === name);
    if (!c) return [];
    const out: Element[] = [];
    for (const el of elementsUnder(root, skip)) {
      if (!affects(c, el, baseUtilities(el))) continue;
      out.push(el);
      if (out.length >= limit) break;
    }
    return out;
  }
}

function affects(c: Compiled, el: Element, utilities: string[]): boolean {
  return c.classes.some((re) => utilities.some((u) => re.test(u))) || c.selectors.some((s) => el.matches(s));
}

function* elementsUnder(root: Element, skip: Element | null): Generator<Element> {
  yield root;
  for (const el of root.querySelectorAll("*")) {
    if (skip && (el === skip || skip.contains(el))) continue;
    yield el;
  }
}

/** The element's classes as base utilities: `hover:bg-primary/90` → `bg-primary/90`, `!p-4` → `p-4`. */
export function baseUtilities(el: Element): string[] {
  const out: string[] = [];
  for (const cls of el.classList) out.push(stripVariants(cls).replace(/^!|!$/g, ""));
  return out;
}

/** `md:hover:p-4` → `p-4`; colons inside brackets (`[&_svg]:size-4`) don't count. */
export function stripVariants(token: string): string {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) last = i;
  }
  return token.slice(last + 1);
}

// A small evaluator for the CSS values tokens are written in: lengths, numbers,
// `var()` references and `calc()` arithmetic. Used to show a derived token's value
// (T4.1), to detach it to a literal, and to find the nearest token (T4.6).

export interface Quantity {
  value: number;
  /** "" for a plain number; otherwise a CSS unit such as "rem", "px", "%". */
  unit: string;
}

/** Looks up a token's raw value by name (`--radius`), or null if it isn't defined. */
export type TokenLookup = (name: string) => string | null;

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
  }
}

/**
 * Evaluate a value such as `calc(var(--radius) * 0.8)` to a single quantity.
 * Throws CalcError when it isn't arithmetic over lengths and numbers, or mixes
 * units that can't be combined without layout (`1rem - 4px`).
 */
export function evaluate(value: string, lookup: TokenLookup, seen: ReadonlySet<string> = new Set()): Quantity {
  const parser = new Parser(tokenize(value), lookup, seen);
  const result = parser.expression();
  parser.end();
  return result;
}

/** `evaluate`, or null when the value isn't a single quantity. */
export function tryEvaluate(value: string, lookup: TokenLookup): Quantity | null {
  try {
    return evaluate(value, lookup);
  } catch (error) {
    if (error instanceof CalcError) return null;
    throw error;
  }
}

/** `0.5rem`, `12px`, `1.2`: at most 4 decimals, no trailing zeros. */
export function formatQuantity(q: Quantity): string {
  const rounded = Math.round(q.value * 10_000) / 10_000;
  return `${Object.is(rounded, -0) ? 0 : rounded}${q.unit}`;
}

/** Token names a value refers to with `var(--name)`, in order, without duplicates. */
export function referencedTokens(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const name = m[1] as string;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Replace every `var(--x)` with the literal it resolves to, recursively, keeping
 * the rest of the value: `calc(var(--radius) - 4px)` → `calc(0.625rem - 4px)`.
 * A reference that can't be resolved throws.
 */
export function substituteVars(value: string, lookup: TokenLookup, seen: ReadonlySet<string> = new Set()): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name: string) => {
    if (seen.has(name)) throw new CalcError(`${name} refers to itself`);
    const raw = lookup(name);
    if (raw === null) throw new CalcError(`${name} is not defined`);
    const q = tryEvaluate(raw, (n) => (n === name ? null : lookup(n)));
    return q ? formatQuantity(q) : substituteVars(raw, lookup, new Set([...seen, name]));
  });
}

type Tok =
  | { t: "num"; value: number; unit: string }
  | { t: "op"; op: "+" | "-" | "*" | "/" }
  | { t: "open" }
  | { t: "close" }
  | { t: "var"; name: string }
  | { t: "calc" };

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const num = /^(\d*\.\d+|\d+)(e[+-]?\d+)?([a-z]+|%)?/i.exec(rest);
    if (num) {
      out.push({ t: "num", value: Number(num[1] + (num[2] ?? "")), unit: (num[3] ?? "").toLowerCase() });
      i += num[0].length;
      continue;
    }
    const ref = /^var\(\s*(--[\w-]+)\s*\)/.exec(rest);
    if (ref) {
      out.push({ t: "var", name: ref[1] as string });
      i += ref[0].length;
      continue;
    }
    if (/^calc\(/.test(rest)) {
      out.push({ t: "calc" });
      i += 5;
      continue;
    }
    const c = input[i] as string;
    if (c === "(") out.push({ t: "open" });
    else if (c === ")") out.push({ t: "close" });
    else if (c === "+" || c === "-" || c === "*" || c === "/") out.push({ t: "op", op: c });
    else throw new CalcError(`can't evaluate ${JSON.stringify(input)}`);
    i++;
  }
  return out;
}

class Parser {
  private at = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly lookup: TokenLookup,
    private readonly seen: ReadonlySet<string>,
  ) {}

  end(): void {
    if (this.at !== this.toks.length) throw new CalcError("unexpected input after the value");
  }

  expression(): Quantity {
    let left = this.term();
    for (let tok = this.toks[this.at]; tok?.t === "op" && (tok.op === "+" || tok.op === "-"); tok = this.toks[this.at]) {
      this.at++;
      const right = this.term();
      left = addSub(left, right, tok.op);
    }
    return left;
  }

  private term(): Quantity {
    let left = this.factor();
    for (let tok = this.toks[this.at]; tok?.t === "op" && (tok.op === "*" || tok.op === "/"); tok = this.toks[this.at]) {
      this.at++;
      const right = this.factor();
      if (tok.op === "*") {
        if (left.unit !== "" && right.unit !== "") throw new CalcError("can't multiply two lengths");
        left = { value: left.value * right.value, unit: left.unit || right.unit };
      } else {
        if (right.unit !== "") throw new CalcError("can't divide by a length");
        if (right.value === 0) throw new CalcError("division by zero");
        left = { value: left.value / right.value, unit: left.unit };
      }
    }
    return left;
  }

  private factor(): Quantity {
    const tok = this.toks[this.at++];
    if (!tok) throw new CalcError("unexpected end of value");
    switch (tok.t) {
      case "num":
        return { value: tok.value, unit: tok.unit };
      case "op":
        if (tok.op === "-") {
          const q = this.factor();
          return { value: -q.value, unit: q.unit };
        }
        throw new CalcError(`unexpected ${tok.op}`);
      case "calc":
      case "open": {
        const q = this.expression();
        if (this.toks[this.at++]?.t !== "close") throw new CalcError("missing )");
        return q;
      }
      case "var": {
        if (this.seen.has(tok.name)) throw new CalcError(`${tok.name} refers to itself`);
        const raw = this.lookup(tok.name);
        if (raw === null) throw new CalcError(`${tok.name} is not defined`);
        return evaluate(raw, this.lookup, new Set([...this.seen, tok.name]));
      }
      case "close":
        throw new CalcError("unexpected )");
    }
  }
}

function addSub(a: Quantity, b: Quantity, op: "+" | "-"): Quantity {
  const sign = op === "+" ? 1 : -1;
  if (a.unit === b.unit) return { value: a.value + sign * b.value, unit: a.unit };
  // calc(0 + 1rem): a unitless zero combines with anything.
  if (a.unit === "" && a.value === 0) return { value: sign * b.value, unit: b.unit };
  if (b.unit === "" && b.value === 0) return a;
  throw new CalcError(`can't combine ${a.unit || "a number"} and ${b.unit || "a number"}`);
}

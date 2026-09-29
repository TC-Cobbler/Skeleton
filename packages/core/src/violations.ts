import * as t from "@babel/types";
import { parseModule } from "./parse.js";

export type ViolationKind = "inline-style" | "arbitrary-value" | "hard-coded-colour";

export interface Violation {
  file: string;
  line: number;
  /** Source offset, for stable ordering. */
  offset: number;
  kind: ViolationKind;
  /** The offending class token, or the style attribute's source. */
  value: string;
}

const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "classNames", "tv"]);

const PALETTE_COLOURS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITIES =
  "bg|text|border|border-[trblxy]|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow";
const HARD_CODED_COLOUR = new RegExp(`^(${COLOUR_UTILITIES})-((${PALETTE_COLOURS})-\\d{2,3}|black|white)(\\/\\d+)?$`);

/** Violations of contract rule 2 (style only with tokens) in one source file. */
export function findViolations(source: string, file: string): Violation[] {
  const ast = parseModule(source);
  const out: Violation[] = [];

  const checkClassString = (value: string, line: number, offset: number) => {
    for (const token of value.split(/\s+/).filter(Boolean)) {
      const utility = stripVariants(token).replace(/^!/, "");
      if (utility.includes("[")) out.push({ file, line, offset, kind: "arbitrary-value", value: token });
      else if (HARD_CODED_COLOUR.test(utility)) out.push({ file, line, offset, kind: "hard-coded-colour", value: token });
    }
  };
  const checkStrings = (node: t.Node) => {
    t.traverseFast(node, (n) => {
      const line = n.loc?.start.line ?? -1;
      const offset = n.start ?? -1;
      if (t.isStringLiteral(n)) checkClassString(n.value, line, offset);
      else if (t.isTemplateElement(n)) checkClassString(n.value.cooked ?? n.value.raw, line, offset);
    });
  };

  t.traverseFast(ast, (node) => {
    if (t.isJSXAttribute(node) && t.isJSXIdentifier(node.name)) {
      const line = node.loc?.start.line ?? -1;
      if (node.name.name === "style") {
        const text = source.slice(node.start ?? 0, node.end ?? 0);
        out.push({ file, line, offset: node.start ?? -1, kind: "inline-style", value: text });
      } else if (node.name.name === "className" && node.value) {
        checkStrings(node.value);
      }
    } else if (t.isCallExpression(node) && t.isIdentifier(node.callee) && CLASS_FUNCTIONS.has(node.callee.name)) {
      // Nested className={cn(...)} strings are reached from the attribute too; dedupe below.
      for (const arg of node.arguments) checkStrings(arg);
    }
  });

  const seen = new Set<string>();
  out.sort((a, b) => a.offset - b.offset);
  return out.filter((v) => {
    const key = `${v.offset}\0${v.kind}\0${v.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** `max-md:hover:p-[3px]` → `p-[3px]`; `[&_tr]:border-b` → `border-b`. Colons inside brackets don't split. */
function stripVariants(token: string): string {
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ":" && depth === 0) lastColon = i;
  }
  return token.slice(lastColon + 1);
}

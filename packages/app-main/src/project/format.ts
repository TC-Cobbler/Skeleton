// Prettier for attribute edits (T3.7), limited to the edited node. Prettier's range
// formatting expands to the enclosing statement (a page's whole `return (…)`), which
// would reformat agent code, so the edited element is formatted on its own, and only
// when every attribute on it is a literal (Skeleton-owned): the whole element when its
// children are only text, otherwise just its opening tag. Tags with agent logic keep
// their layout (ADR 002).

import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { format, resolveConfig } from "prettier";

const DEFAULT_PRINT_WIDTH = 80;

/**
 * `source` with the element whose `data-ui-id` is `id` in Prettier's shape (the
 * project's config, at the element's indentation): all of it when its children are
 * text only, else its opening tag. Unchanged when it already is, carries non-literal
 * attributes, or isn't found.
 */
export async function formatEdited(source: string, id: string, filepath: string): Promise<string> {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  let found: t.JSXElement | null = null;
  t.traverseFast(ast, (n) => {
    if (found || !t.isJSXElement(n)) return;
    const hit = n.openingElement.attributes.some(
      (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "data-ui-id" }) && t.isStringLiteral(a.value, { value: id }),
    );
    if (hit) found = n;
  });
  const el = found as t.JSXElement | null;
  if (!el || el.start == null || el.end == null) return source;
  const tag = el.openingElement;
  if (tag.start == null || tag.end == null) return source;
  if (!tag.attributes.every((a) => t.isJSXAttribute(a) && isLiteral(a.value))) return source;
  const textOnly = el.children.every((c) => t.isJSXText(c) || (t.isJSXExpressionContainer(c) && t.isStringLiteral(c.expression)));

  const lineStart = source.lastIndexOf("\n", tag.start - 1) + 1;
  const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
  // The tag must start its line (after indentation) for the indent to be its own.
  if (source.slice(lineStart, tag.start).trim() !== "") return source;

  const config = (await resolveConfig(filepath)) ?? {};
  const printWidth = typeof config.printWidth === "number" ? config.printWidth : DEFAULT_PRINT_WIDTH;
  const options = { ...config, parser: "typescript", filepath, printWidth: Math.max(20, printWidth - indent.length) };
  // (A text-only element is formatted one level deeper, inside a fragment.)
  const reindent = (text: string) => text.split("\n").map((line, i) => (i === 0 || line === "" ? line : indent + line)).join("\n");

  if (textOnly) {
    // A text-only element with literal attributes is all Skeleton's: format all of it,
    // as a child element (Prettier lays out JSX children differently from a statement).
    const current = source.slice(el.start, el.end);
    const lines = (await format(`<>${current}</>`, options)).trimEnd().split("\n");
    if (lines[0] !== "<>" || lines[lines.length - 1] !== "</>;") return source;
    const inner = lines.slice(1, -1);
    const step = /^[ \t]*/.exec(inner[0] ?? "")?.[0] ?? "";
    if (inner.length === 0 || !inner.every((l) => l === "" || l.startsWith(step))) return source;
    const next = reindent(inner.map((l) => l.slice(step.length)).join("\n"));
    return next === current ? source : source.slice(0, el.start) + next + source.slice(el.end);
  }

  const text = source.slice(tag.start, tag.end);
  // Format as a self-closing element, then put back what closes the original tag.
  const snippet = tag.selfClosing ? text : `${text.slice(0, -1).trimEnd()} />`;
  const formatted = (await format(snippet, options)).trim().replace(/;$/, "");
  if (!formatted.startsWith("<") || !formatted.endsWith("/>")) return source;
  const next = reindent(tag.selfClosing ? formatted : formatted.replace(/\s*\/>$/, (m) => (m.includes("\n") ? m.replace("/>", ">") : ">")));
  return next === text ? source : source.slice(0, tag.start) + next + source.slice(tag.end);
}

function isLiteral(value: t.JSXAttribute["value"]): boolean {
  if (value === null || value === undefined || t.isStringLiteral(value)) return true;
  if (!t.isJSXExpressionContainer(value)) return false;
  const e = value.expression;
  return (
    t.isStringLiteral(e) ||
    t.isNumericLiteral(e) ||
    t.isBooleanLiteral(e) ||
    t.isNullLiteral(e) ||
    (t.isTemplateLiteral(e) && e.expressions.length === 0) ||
    (t.isUnaryExpression(e) && e.operator === "-" && t.isNumericLiteral(e.argument))
  );
}

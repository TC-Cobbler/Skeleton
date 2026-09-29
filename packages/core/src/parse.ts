import { parse as babelParse, type ParserOptions } from "@babel/parser";
import * as t from "@babel/types";
import * as recast from "recast";
import { ParseError } from "./errors.js";

const babelOptions: ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx"],
  tokens: true,
};

/**
 * Parse TSX source into a Babel AST wrapped by recast, so that printing it
 * back reuses the original text for every node that wasn't modified.
 */
export function parseModule(source: string): t.File {
  try {
    const ast: unknown = recast.parse(source, {
      parser: { parse: (s: string) => babelParse(s, babelOptions) },
    });
    if (!t.isFile(ast as t.Node)) throw new ParseError("recast did not return a File node");
    return ast as t.File;
  } catch (cause) {
    if (cause instanceof ParseError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ParseError(`failed to parse source: ${message}`, { cause });
  }
}

export function printModule(ast: t.File): string {
  return recast.print(ast).code;
}

/** Parse a single JSX expression (e.g. a palette template). */
export function parseJsxExpression(jsx: string): t.JSXElement {
  let file: t.File;
  try {
    file = babelParse(`(${jsx});`, babelOptions);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ParseError(`failed to parse JSX: ${message}`, { cause });
  }
  const [stmt, ...rest] = file.program.body;
  if (!stmt || rest.length > 0 || !t.isExpressionStatement(stmt) || !t.isJSXElement(stmt.expression)) {
    throw new ParseError("expected exactly one JSX element");
  }
  const el = stripLocations(stmt.expression);
  // Parsed inside `( )`, so Babel flags it parenthesized; recast would print the parens.
  if (el.extra) delete el.extra.parenthesized;
  return el;
}

/** Drop position info so recast treats the node as new and prints it fresh. */
function stripLocations<T extends t.Node>(node: T): T {
  t.traverseFast(node, (n) => {
    const mutable = n as t.Node & { start?: number | null; end?: number | null };
    mutable.loc = null;
    mutable.start = null;
    mutable.end = null;
  });
  return node;
}

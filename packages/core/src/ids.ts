import * as t from "@babel/types";
import { print } from "recast";
import { parseJsxExpression, parseModule } from "./parse.js";

export const UI_ID_ATTR = "data-ui-id";
export const UI_ID_PATTERN = /^ui_[a-z0-9]{5}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function isUiId(value: string): boolean {
  return UI_ID_PATTERN.test(value);
}

/** Returns a number in [0, 1). Injectable so minting is deterministic in tests. */
export type Random = () => number;

/** Mint a `ui_xxxxx` ID not present in `taken`. Adds it to `taken`. */
export function mintId(taken: Set<string>, random: Random = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = "ui_";
    for (let i = 0; i < 5; i++) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  throw new Error("mintId: could not find an unused ID after 1000 attempts");
}

export interface IdOccurrence {
  file: string;
  line: number;
  /** Element name carrying the ID. */
  element: string;
}

export interface IdIndex {
  ids: Map<string, IdOccurrence[]>;
  /** IDs that appear more than once across the project. */
  duplicates: string[];
  /** `data-ui-id` values that don't match the `ui_xxxxx` format, or aren't string literals. */
  malformed: IdOccurrence[];
}

/** Every literal `data-ui-id` in one source file, in document order. */
export function collectIds(source: string, file = "<source>"): { ids: [string, IdOccurrence][]; malformed: IdOccurrence[] } {
  const ast = parseModule(source);
  const ids: [string, IdOccurrence][] = [];
  const malformed: IdOccurrence[] = [];
  t.traverseFast(ast, (node) => {
    if (!t.isJSXOpeningElement(node)) return;
    for (const attr of node.attributes) {
      if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name, { name: UI_ID_ATTR })) continue;
      const occ: IdOccurrence = { file, line: attr.loc?.start.line ?? -1, element: nameOf(node.name) };
      const value = t.isStringLiteral(attr.value)
        ? attr.value.value
        : t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)
          ? attr.value.expression.value
          : null;
      if (value !== null && isUiId(value)) ids.push([value, occ]);
      else malformed.push(occ);
    }
  });
  return { ids, malformed };
}

/** Project-wide ID index. `files` maps a project-relative path to its source. */
export function buildIdIndex(files: Record<string, string>): IdIndex {
  const ids = new Map<string, IdOccurrence[]>();
  const malformed: IdOccurrence[] = [];
  for (const [file, source] of Object.entries(files)) {
    const found = collectIds(source, file);
    malformed.push(...found.malformed);
    for (const [id, occ] of found.ids) {
      const list = ids.get(id);
      if (list) list.push(occ);
      else ids.set(id, [occ]);
    }
  }
  const duplicates = [...ids].filter(([, occ]) => occ.length > 1).map(([id]) => id);
  return { ids, duplicates, malformed };
}

function nameOf(name: t.JSXOpeningElement["name"]): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return `${nameOf(name.object)}.${name.property.name}`;
}

/**
 * Give every element in a JSX template that lacks a `data-ui-id` a freshly minted one
 * (first attribute). Used for palette templates before `insert`.
 */
export function fillMissingIds(jsx: string, taken: Set<string>, random: Random = Math.random): string {
  const el = parseJsxExpression(jsx);
  t.traverseFast(el, (n) => {
    if (!t.isJSXElement(n)) return;
    const has = n.openingElement.attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: UI_ID_ATTR }));
    if (!has) n.openingElement.attributes.unshift(t.jsxAttribute(t.jsxIdentifier(UI_ID_ATTR), t.stringLiteral(mintId(taken, random))));
  });
  return print(el).code;
}

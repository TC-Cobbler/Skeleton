// Every icon-only button says what it does (T8.5, spec §3): it's an IconButton, with a
// required label that is its name and its tooltip. Native title= hints are gone too,
// since they never show on keyboard focus.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx"));

interface Finding {
  where: string;
  problem: string;
}

function check(file: string): Finding[] {
  const source = ts.createSourceFile(file, readFileSync(path.join(src, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const where = (n: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const tag = opening.tagName.getText(source);
      const attrs = opening.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(source));
      if (attrs.includes("title") && /^[a-z]/.test(tag) && tag !== "iframe") found.push({ where: where(node), problem: `title= on <${tag}>: use a Tooltip` });
      // IconButton's own <button> is the one allowed to show only an icon.
      if (tag === "button" && file !== "Tooltip.tsx") {
        const words =
          ts.isJsxElement(node) && node.children.some((c) => (ts.isJsxText(c) && /\p{L}/u.test(c.text)) || ts.isJsxExpression(c) || ts.isJsxElement(c));
        if (!words) found.push({ where: where(node), problem: "a <button> without words is icon-only: use IconButton" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("icon-only buttons and hints (T8.5)", () => {
  it("finds what it looks for", () => {
    expect(files).toContain("Tooltip.tsx");
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no icon-only <button> outside IconButton, and no title= hints", () => {
    expect(files.flatMap(check)).toEqual([]);
  });
});

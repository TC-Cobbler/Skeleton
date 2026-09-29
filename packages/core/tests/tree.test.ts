import { describe, expect, it } from "vitest";
import { buildTree, findNodeById, walkTree, type UiNode } from "../src/index.js";
import { readFixture } from "./helpers.js";

function summary(node: UiNode): string {
  return `${node.kind}:${node.name}${node.id ? `#${node.id}` : ""}`;
}

describe("buildTree on fixtures/base HomePage", () => {
  const tree = buildTree(readFixture("base/src/pages/HomePage.tsx"));

  it("has one root, the page Stack", () => {
    expect(tree.rootError).toBeNull();
    expect(tree.roots.map(summary)).toEqual(["primitive:Stack#ui_h0m3p"]);
  });

  it("classifies palette, primitive and plain nodes", () => {
    const kinds = new Map<string, string>();
    walkTree(tree.roots, (n) => kinds.set(n.id ?? n.name, n.kind));
    expect(kinds.get("ui_t1tle")).toBe("plain");
    expect(kinds.get("ui_act10")).toBe("primitive");
    expect(kinds.get("ui_new0r")).toBe("palette");
    expect(kinds.get("ui_tbl01")).toBe("palette");
    expect(kinds.get("ui_tc003")).toBe("palette");
    expect([...kinds.values()]).not.toContain("locked");
  });

  it("keeps text content", () => {
    expect(findNodeById(tree.roots, "ui_exp0r")?.text).toBe("Export");
  });
});

describe("buildTree on pathological agent page", () => {
  const tree = buildTree(readFixture("pathological/agent-page.tsx"));
  const root = tree.roots[0];

  it("locks .map, conditionals, custom components and logic-bearing props", () => {
    expect(root?.children.map(summary)).toEqual([
      "primitive:Stack#ui_bar01",
      "locked:map",
      "locked:conditional",
      "palette:Card#ui_card1",
      "primitive:Stack#ui_empty",
      "locked:expression",
    ]);
    expect(findNodeById(tree.roots, "ui_btn01")?.kind).toBe("locked");
    expect(findNodeById(tree.roots, "ui_btn01")?.lockReason).toBe("logic in onClick prop");
    expect(findNodeById(tree.roots, "ui_btn02")?.kind).toBe("palette");
    expect(findNodeById(tree.roots, "ui_ordt1")?.kind).toBe("locked");
  });

  it("does not expose IDs inside locked blocks as tree nodes", () => {
    expect(findNodeById(tree.roots, "ui_row01")).toBeNull();
    expect(root?.children[1]?.containedIds).toEqual(["ui_row01"]);
  });

  it("ignores JSX comments", () => {
    const bar = findNodeById(tree.roots, "ui_bar01");
    expect(bar?.children.map(summary)).toEqual(["locked:Button#ui_btn01", "palette:Button#ui_btn02"]);
  });
});

describe("buildTree conservatism", () => {
  const page = (body: string, imports = "") => `${imports}\nexport default function P() {\n  return (\n${body}\n  );\n}\n`;

  it("locks components not imported from components/ui or components/layout", () => {
    const tree = buildTree(page(`<Button data-ui-id="ui_aaaaa" />`, `import { Button } from "some-lib";`));
    expect(tree.roots[0]?.kind).toBe("locked");
  });

  it("locks spread props, key, ref and member elements", () => {
    const imports = `import { Stack } from "@/components/layout";`;
    for (const el of [`<Stack {...p} />`, `<Stack key="a" />`, `<Stack ref={r} />`, `<Motion.div />`, `<Stack className={cn("a")} />`]) {
      expect(buildTree(page(el, imports)).roots[0]?.kind, el).toBe("locked");
    }
  });

  it("keeps literal expression props editable", () => {
    const tree = buildTree(page(`<Stack gap={4} wrap={true} label={"x"} />`, `import { Stack } from "@/components/layout";`));
    expect(tree.roots[0]?.kind).toBe("primitive");
  });

  it("follows `export default Name` and arrow components", () => {
    const src = `const P = () => <div data-ui-id="ui_bbbbb" />;\nexport default P;\n`;
    expect(buildTree(src).roots.map(summary)).toEqual(["plain:div#ui_bbbbb"]);
  });

  it("reports when there is no default export", () => {
    expect(buildTree(`export const x = 1;`).rootError).toMatch(/no default-exported/);
  });

  it("returns one root per JSX return (early returns included)", () => {
    const src = `export default function P({ a }: { a: boolean }) {\n  if (a) return <p data-ui-id="ui_ccccc" />;\n  return <div data-ui-id="ui_ddddd" />;\n}\n`;
    expect(buildTree(src).roots.map(summary)).toEqual(["plain:p#ui_ccccc", "plain:div#ui_ddddd"]);
  });
});

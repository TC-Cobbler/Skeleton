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

  it("locks .map, conditionals and custom components; logic-bearing props only protect the prop", () => {
    expect(root?.children.map(summary)).toEqual([
      "primitive:Stack#ui_bar01",
      "locked:map",
      "locked:conditional",
      "palette:Card#ui_card1",
      "primitive:Stack#ui_empty",
      "locked:expression",
    ]);
    const btn = findNodeById(tree.roots, "ui_btn01");
    expect(btn?.kind).toBe("palette");
    expect(btn?.protectedProps).toEqual(["onClick"]);
    expect(findNodeById(tree.roots, "ui_btn02")?.protectedProps).toEqual([]);
    expect(findNodeById(tree.roots, "ui_ordt1")?.kind).toBe("locked");
  });

  it("exposes elements wrapped by locked blocks for in-place editing", () => {
    const map = root?.children[1];
    expect(map?.containedIds).toEqual(["ui_row01"]);
    expect(map?.children.map(summary)).toEqual(["plain:div#ui_row01"]);
    expect(findNodeById(tree.roots, "ui_row01")?.protectedProps).toEqual(["key"]);
    expect(root?.children[2]?.children.map(summary)).toEqual(["plain:p#ui_load1"]);
  });

  it("ignores JSX comments", () => {
    const bar = findNodeById(tree.roots, "ui_bar01");
    expect(bar?.children.map(summary)).toEqual(["palette:Button#ui_btn01", "palette:Button#ui_btn02"]);
  });
});

describe("buildTree conservatism", () => {
  const page = (body: string, imports = "") => `${imports}\nexport default function P() {\n  return (\n${body}\n  );\n}\n`;

  it("locks components not imported from components/ui or components/layout", () => {
    const tree = buildTree(page(`<Button data-ui-id="ui_aaaaa" />`, `import { Button } from "some-lib";`));
    expect(tree.roots[0]?.kind).toBe("locked");
  });

  it("locks spread props and member elements", () => {
    const imports = `import { Stack } from "@/components/layout";`;
    for (const el of [`<Stack {...p} />`, `<Stack className="a" {...p} />`, `<Motion.div />`]) {
      expect(buildTree(page(el, imports)).roots[0]?.kind, el).toBe("locked");
    }
  });

  it("protects key, ref and non-literal props without locking the element", () => {
    const imports = `import { Stack } from "@/components/layout";`;
    const cases: [string, string[]][] = [
      [`<Stack key="a" />`, ["key"]],
      [`<Stack ref={r} />`, ["ref"]],
      [`<Stack className={cn("a")} />`, ["className"]],
      [`<Stack data-ui-id={id} onClick={go} gap={4} />`, ["data-ui-id", "onClick"]],
    ];
    for (const [el, props] of cases) {
      const root = buildTree(page(el, imports)).roots[0];
      expect(root?.kind, el).toBe("primitive");
      expect(root?.protectedProps, el).toEqual(props);
    }
  });

  it("exposes children of custom components and conditional/map branches", () => {
    const src = page(
      `<Dialog><Button data-ui-id="ui_aaaaa" /></Dialog>`,
      `import { Button } from "@/components/ui/button";\nimport { Dialog } from "./Dialog";`,
    );
    const root = buildTree(src).roots[0];
    expect(root?.kind).toBe("locked");
    expect(root?.children.map(summary)).toEqual(["palette:Button#ui_aaaaa"]);
    const nested = buildTree(
      `export default function P() {\n  return <div data-ui-id="ui_bbbbb">{a ? <p data-ui-id="ui_ccccc" /> : b && <i data-ui-id="ui_ddddd" />}{xs.map((x) => { const y = x; return <b key={y} data-ui-id="ui_eeeee" />; })}{render()}</div>;\n}\n`,
    ).roots[0];
    expect(nested?.children.map((c) => [summary(c), c.children.map(summary)])).toEqual([
      ["locked:conditional", ["plain:p#ui_ccccc", "plain:i#ui_ddddd"]],
      ["locked:map", ["plain:b#ui_eeeee"]],
      ["locked:expression", []],
    ]);
  });

  it("exposes a .map nested in a conditional branch", () => {
    const src = `export default function P() {\n  return <div data-ui-id="ui_aaaaa">{xs.length === 0 ? <p data-ui-id="ui_bbbbb" /> : xs.map((x) => <b key={x} data-ui-id="ui_ccccc" />)}</div>;\n}\n`;
    const cond = buildTree(src).roots[0]?.children[0];
    expect(cond?.children.map((c) => [summary(c), c.children.map(summary)])).toEqual([
      ["plain:p#ui_bbbbb", []],
      ["locked:map", ["plain:b#ui_ccccc"]],
    ]);
  });

  it("reports literal prop values, leaving out the ID and protected props", () => {
    const src = `import { Button } from "@/components/ui/button";
export default function P() {
  return <Button data-ui-id="ui_aaaaa" variant="outline" disabled tabIndex={-1} size={"sm"} rows={3} title={\`t\`} open={false} x={null} onClick={go} key="k" />;
}
`;
    const node = buildTree(src).roots[0];
    expect(node?.props).toEqual({ variant: "outline", disabled: true, tabIndex: -1, size: "sm", rows: 3, title: "t", open: false, x: null });
    expect(node?.protectedProps).toEqual(["onClick", "key"]);
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

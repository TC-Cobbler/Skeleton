import { describe, expect, it } from "vitest";
import { EditOpError, insert, move, remove, setClass, setProp } from "../src/index.js";
import { assertSurgical, linesOf, readFixture } from "./helpers.js";

const home = readFixture("base/src/pages/HomePage.tsx");
const agent = readFixture("pathological/agent-page.tsx");

describe("insert", () => {
  it("inserts a child at an index with a one-line diff", () => {
    const r = insert(home, "ui_act10", 1, `<Button data-ui-id="ui_ins01">Import</Button>`);
    assertSurgical(home, r, [linesOf(home, 'data-ui-id="ui_act10"', "</Stack>")]);
    expect(r.diff.linesAdded).toBe(1);
    expect(r.diff.linesRemoved).toBe(0);
    expect(r.source).toContain(`        <Button data-ui-id="ui_new0r">New order</Button>\n        <Button data-ui-id="ui_ins01">Import</Button>\n        <Button data-ui-id="ui_exp0r" variant="outline">`);
  });

  it("inserts at index 0 and at the end", () => {
    const first = insert(home, "ui_act10", 0, `<Button data-ui-id="ui_ins01">A</Button>`);
    assertSurgical(home, first, [linesOf(home, 'data-ui-id="ui_act10"', "</Stack>")]);
    expect(first.source).toContain(`className="gap-2">\n        <Button data-ui-id="ui_ins01">A</Button>\n        <Button data-ui-id="ui_new0r">`);
    const last = insert(home, "ui_act10", 2, `<Button data-ui-id="ui_ins02">Z</Button>`);
    assertSurgical(home, last, [linesOf(home, 'data-ui-id="ui_act10"', "</Stack>")]);
    expect(last.source).toContain(`        </Button>\n        <Button data-ui-id="ui_ins02">Z</Button>\n      </Stack>`);
  });

  it("inserts next to agent code without touching it", () => {
    const r = insert(agent, "ui_root1", 3, `<Card data-ui-id="ui_ins03" />`);
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_root1"', "{children}")]);
    expect(r.diff.linesAdded).toBe(1);
    expect(r.diff.linesRemoved).toBe(0);
  });

  it("opens a self-closing parent", () => {
    const r = insert(agent, "ui_empty", 0, `<Button data-ui-id="ui_ins04">Go</Button>`);
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_empty"')]);
    expect(r.source).toContain(`      <Stack data-ui-id="ui_empty" className="gap-2">\n        <Button data-ui-id="ui_ins04">Go</Button>\n      </Stack>\n`);
  });

  it("inserts multi-line JSX", () => {
    const r = insert(home, "ui_h0m3p", 1, `<Card data-ui-id="ui_ins05"><CardContent data-ui-id="ui_ins06">Hi</CardContent></Card>`);
    assertSurgical(home, r, [{ start: linesOf(home, 'data-ui-id="ui_t1tle"').start, end: linesOf(home, 'data-ui-id="ui_act10"').end }]);
    expect(r.source).toMatch(/ui_ins05[\s\S]*ui_ins06/);
  });

  it("refuses locked parents, duplicate or missing IDs", () => {
    expect(() => insert(agent, "ui_ordt1", 0, `<b data-ui-id="ui_zzzzz" />`)).toThrow(/locked block/);
    expect(() => insert(home, "ui_act10", 0, `<b data-ui-id="ui_new0r" />`)).toThrow(/already exists/);
    expect(() => insert(home, "ui_act10", 0, `<b />`)).toThrow(/no literal data-ui-id/);
    expect(() => insert(home, "ui_act10", 9, `<b data-ui-id="ui_zzzzz" />`)).toThrow(/out of range/);
    expect(() => insert(home, "ui_nope0", 0, `<b data-ui-id="ui_zzzzz" />`)).toThrow(/not found/);
  });

  it("names the op and node in errors", () => {
    try {
      insert(home, "ui_nope0", 0, `<b data-ui-id="ui_zzzzz" />`);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EditOpError);
      expect((e as EditOpError).message).toMatch(/^insert\(ui_nope0\): /);
    }
  });
});

describe("move", () => {
  it("reorders within a stack", () => {
    const r = move(home, { id: "ui_exp0r" }, "ui_act10", 0);
    assertSurgical(home, r, [linesOf(home, 'data-ui-id="ui_act10"', "</Stack>")]);
    expect(r.source.indexOf("ui_exp0r")).toBeLessThan(r.source.indexOf("ui_new0r"));
  });

  it("moves a node across stacks", () => {
    const r = move(home, { id: "ui_crd01" }, "ui_act10", 0);
    assertSurgical(home, r, [{ start: linesOf(home, 'data-ui-id="ui_act10"').start, end: linesOf(home, "</Card>").end }]);
  });

  it("moves a multi-line locked .map block verbatim", () => {
    const mapRange = linesOf(agent, "{rows.map", "))}");
    const block = agent.split("\n").slice(mapRange.start - 1, mapRange.end).join("\n");
    const r = move(agent, { parentId: "ui_root1", index: 1 }, "ui_bar01", 2);
    assertSurgical(agent, r, [{ start: linesOf(agent, 'data-ui-id="ui_bar01"').start, end: mapRange.end }]);
    // The agent's loop text is unchanged apart from indentation.
    const dedent = (s: string) => s.split("\n").map((l) => l.trim()).join("\n");
    expect(dedent(r.source)).toContain(dedent(block));
    expect(r.source).toContain("<div key={r.id} data-ui-id=\"ui_row01\">");
  });

  it("moves a locked custom component by ID", () => {
    const r = move(agent, { id: "ui_ordt1" }, "ui_root1", 0);
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_root1"', "</Card>")]);
    expect(r.source).toContain(`<OrdersTable data-ui-id="ui_ordt1" rows={rows} />`);
  });

  it("refuses to move into itself, a descendant or a locked block", () => {
    expect(() => move(home, { id: "ui_crd01" }, "ui_tbl01", 0)).toThrow(/itself or its own descendant/);
    expect(() => move(agent, { id: "ui_btn02" }, "ui_ordt1", 0)).toThrow(/locked block/);
    expect(() => move(home, { id: "ui_h0m3p" }, "ui_act10", 0)).toThrow(/root/);
  });
});

describe("remove", () => {
  it("removes a node and its separator line only", () => {
    const r = remove(home, { id: "ui_exp0r" });
    assertSurgical(home, r, [linesOf(home, 'data-ui-id="ui_exp0r"', "</Button>")], ["ui_exp0r"]);
    expect(r.diff.linesAdded).toBe(0);
    expect(r.diff.linesRemoved).toBe(3);
  });

  it("removes a subtree and reports its IDs gone", () => {
    const r = remove(home, { id: "ui_crd01" });
    assertSurgical(home, r, [linesOf(home, 'data-ui-id="ui_crd01"', "</Card>")], [
      "ui_crd01", "ui_crdh1", "ui_crdt1", "ui_crdc1", "ui_tbl01", "ui_thd01", "ui_thr01",
      "ui_th001", "ui_th002", "ui_th003", "ui_tbd01", "ui_tbr01", "ui_tc001", "ui_tc002", "ui_tc003",
    ]);
  });

  it("refuses locked content unless confirmed", () => {
    expect(() => remove(agent, { id: "ui_card1" })).toThrow(/locked block/);
    const r = remove(agent, { id: "ui_card1" }, { allowLocked: true });
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_card1"', "</Card>")], ["ui_card1", "ui_cc001", "ui_ordt1"]);
  });
});

describe("setProp", () => {
  it("changes an existing prop on its own line", () => {
    const r = setProp(agent, "ui_btn02", "variant", "ghost");
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_btn02"')]);
    expect(r.diff.linesAdded).toBe(1);
  });

  it("adds, changes type, and removes props", () => {
    const added = setProp(home, "ui_new0r", "size", "sm");
    assertSurgical(home, added, [linesOf(home, 'data-ui-id="ui_new0r"')]);
    expect(added.source).toContain(`<Button data-ui-id="ui_new0r" size="sm">New order</Button>`);
    const num = setProp(home, "ui_act10", "tabIndex", -1);
    expect(num.source).toContain(`tabIndex={-1}`);
    const removed = setProp(home, "ui_act10", "direction", null);
    assertSurgical(home, removed, [linesOf(home, 'data-ui-id="ui_act10"')]);
    expect(removed.source).toContain(`<Stack data-ui-id="ui_act10" className="gap-2">`);
  });

  it("refuses protected props and locked targets", () => {
    for (const key of ["data-ui-id", "className", "onClick", "key", "ref", "style"]) {
      expect(() => setProp(home, "ui_new0r", key, "x"), key).toThrow(/cannot be set/);
    }
    expect(() => setProp(agent, "ui_ordt1", "rows", "x")).toThrow(/locked block/);
  });

  it("edits literal props on a logic-bearing element but never its logic props", () => {
    const r = setProp(agent, "ui_btn01", "variant", "ghost");
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_btn01"')]);
    expect(r.source).toContain(`<Button data-ui-id="ui_btn01" onClick={() => addRow({ id: String(rows.length), label: "x" })} variant="ghost">Add</Button>`);
    expect(() => setProp(agent, "ui_btn01", "onClick", null)).toThrow(/cannot be set/);
    expect(() => setProp(agent, "ui_row01", "key", "x")).toThrow(/cannot be set/);
    const src = `import { Button } from "@/components/ui/button";\nexport default function P() {\n  return <Button data-ui-id="ui_aaaaa" variant={v ? "a" : "b"} size="sm" />;\n}\n`;
    expect(() => setProp(src, "ui_aaaaa", "variant", "ghost")).toThrow(/carries agent logic and is protected/);
    expect(setProp(src, "ui_aaaaa", "size", "lg").source).toContain(`variant={v ? "a" : "b"} size="lg"`);
  });
});

describe("setClass", () => {
  it("adds and removes classes on one line", () => {
    const r = setClass(home, "ui_h0m3p", ["gap-8"], ["gap-6"]);
    assertSurgical(home, r, [linesOf(home, 'data-ui-id="ui_h0m3p"')]);
    expect(r.source).toContain(`className="gap-8 p-8"`);
  });

  it("creates and deletes className", () => {
    const created = setClass(home, "ui_new0r", ["w-full"], []);
    expect(created.source).toContain(`<Button data-ui-id="ui_new0r" className="w-full">`);
    const deleted = setClass(home, "ui_act10", [], ["gap-2"]);
    expect(deleted.source).toContain(`<Stack data-ui-id="ui_act10" direction="horizontal">`);
  });

  it("is a no-op when nothing changes", () => {
    const r = setClass(home, "ui_act10", ["gap-2"], []);
    expect(r.source).toBe(home);
    expect(r.diff.patch).toBe("");
  });

  it("refuses non-literal className and locked targets", () => {
    const src = `import { Stack } from "@/components/layout";\nexport default function P() {\n  return <Stack data-ui-id="ui_aaaaa"><div data-ui-id="ui_bbbbb" className={x} /></Stack>;\n}\n`;
    expect(() => setClass(src, "ui_bbbbb", ["p-2"], [])).toThrow(/className is not a string literal/);
    expect(() => setClass(agent, "ui_ordt1", ["p-2"], [])).toThrow(/locked block/);
  });

  it("styles logic-bearing elements and wrapped elements in place", () => {
    const btn = setClass(agent, "ui_btn01", ["w-full"], []);
    assertSurgical(agent, btn, [linesOf(agent, 'data-ui-id="ui_btn01"')]);
    const row = setClass(agent, "ui_row01", ["py-2"], []);
    assertSurgical(agent, row, [linesOf(agent, 'data-ui-id="ui_row01"')]);
    expect(row.source).toContain(`<div key={r.id} data-ui-id="ui_row01" className="py-2">`);
    const branch = setClass(agent, "ui_load1", ["text-muted-foreground"], []);
    assertSurgical(agent, branch, [linesOf(agent, 'data-ui-id="ui_load1"')]);
    const wrapped = setProp(readFixture("pathological/post-agent-pass1.tsx"), "ui_new0r", "size", "sm");
    expect(wrapped.source).toContain(`<Button data-ui-id="ui_new0r" size="sm">New order</Button>`);
  });
});

describe("wrapped elements stay put", () => {
  const pass1 = readFixture("pathological/post-agent-pass1.tsx");

  it("refuses to move or remove an element out of a locked wrapper", () => {
    expect(() => move(pass1, { id: "ui_new0r" }, "ui_act10", 0)).toThrow(/wrapped by locked NewOrderDialog/);
    expect(() => remove(pass1, { id: "ui_new0r" })).toThrow(/wrapped by locked NewOrderDialog/);
    expect(() => move(agent, { id: "ui_row01" }, "ui_bar01", 0)).toThrow(/wrapped by locked map/);
    expect(() => remove(agent, { id: "ui_load1" }, { allowLocked: true })).toThrow(/wrapped by locked conditional/);
  });

  it("refuses to move a node into a locked wrapper", () => {
    expect(() => move(agent, { id: "ui_btn02" }, "ui_ordt1", 0)).toThrow(/locked block/);
  });

  it("allows inserting into a wrapped element (its own children are ordinary)", () => {
    const r = insert(agent, "ui_row01", 0, `<b data-ui-id="ui_zzzzz">x</b>`);
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_row01"', "</div>")]);
  });

  it("asks for confirmation before removing logic-bearing elements", () => {
    expect(() => remove(agent, { id: "ui_btn01" })).toThrow(/agent logic/);
    const r = remove(agent, { id: "ui_btn01" }, { allowLocked: true });
    assertSurgical(agent, r, [linesOf(agent, 'data-ui-id="ui_btn01"')], ["ui_btn01"]);
  });
});

describe("chained ops keep agent code byte-identical", () => {
  it("survives a sequence of edits on the agent page", () => {
    let src = agent;
    src = insert(src, "ui_bar01", 2, `<Button data-ui-id="ui_seq01">Import</Button>`).source;
    src = setClass(src, "ui_root1", ["gap-6"], ["gap-4"]).source;
    src = move(src, { id: "ui_card1" }, "ui_root1", 0).source;
    src = setProp(src, "ui_btn02", "size", "sm").source;
    src = remove(src, { id: "ui_seq01" }).source;
    // Everything above the JSX return is untouched.
    const head = (s: string) => s.slice(0, s.indexOf("  return ("));
    expect(head(src)).toBe(head(agent));
    expect(src).toContain(`<Button data-ui-id="ui_btn01" onClick={() => addRow({ id: String(rows.length), label: "x" })}>Add</Button>`);
  });
});

describe("move: pathological (spike-log S2)", () => {
  it("keeps a multi-line locked wrapper's indentation when reordering", () => {
    const src = readFixture("pathological/post-agent-pass1.tsx");
    const r = move(src, { parentId: "ui_act10", index: 0 }, "ui_act10", 1);
    assertSurgical(src, r, [linesOf(src, 'data-ui-id="ui_act10"', "</Stack>")]);
    expect(r.source).toContain(
      [
        `      <Stack data-ui-id="ui_act10" direction="horizontal" className="gap-2">`,
        `        <Button data-ui-id="ui_exp0r" variant="secondary">`,
        `          Export`,
        `        </Button>`,
        `        <NewOrderDialog onCreate={addOrder}>`,
        `          <Button data-ui-id="ui_new0r">New order</Button>`,
        `        </NewOrderDialog>`,
        `      </Stack>`,
      ].join("\n"),
    );
  });

  it("re-indents a moved block to its new depth", () => {
    const r = move(agent, { parentId: "ui_root1", index: 1 }, "ui_bar01", 2);
    expect(r.source).toContain(
      [
        `        </Button>`,
        `        {rows.map((r) => (`,
        `          <div key={r.id} data-ui-id="ui_row01">`,
        `            {r.label}`,
        `          </div>`,
        `        ))}`,
        `      </Stack>`,
        `      {loading ?`,
      ].join("\n"),
    );
  });

  it("never re-indents inside a template literal", () => {
    const src = readFixture("pathological/template-literal-block.tsx");
    const r = move(src, { id: "ui_tln00" }, "ui_tlc00", 1);
    assertSurgical(src, r, [linesOf(src, 'data-ui-id="ui_tla00"', "Deep")]);
    expect(r.source).toContain(
      [
        `          <p data-ui-id="ui_tlp00">Deep</p>`,
        `          <Notice`,
        `            data-ui-id="ui_tln00"`,
        "            body={`line one",
        `  indented line two`,
        "line three`}",
        `          />`,
        `        </Stack>`,
      ].join("\n"),
    );
  });
});

describe("setClass ordering (spike-log S3)", () => {
  it("replaces a swapped class in place", () => {
    const r = setClass(agent, "ui_bar01", ["gap-4"], ["gap-2"]);
    expect(r.source).toContain(`<Stack data-ui-id="ui_bar01" direction="horizontal" className="gap-4">`);
    const two = setClass(home, "ui_t1tle", ["text-3xl"], ["text-2xl"]);
    expect(two.source).toContain(`className="text-3xl font-semibold"`);
  });

  it("appends pure additions and ignores duplicates", () => {
    const r = setClass(home, "ui_h0m3p", ["p-8", "w-full", "w-full"], []);
    expect(r.source).toContain(`className="gap-6 p-8 w-full"`);
  });
});

describe("insert: imports (spike-log S5)", () => {
  const pass4 = readFixture("pathological/post-agent-pass4.tsx");

  it("refuses a template whose component isn't imported, naming it", () => {
    expect(() => insert(pass4, "ui_crdh1", 1, `<Input data-ui-id="ui_inp01" />`)).toThrow(
      /template uses Input but the file doesn't import or declare it/,
    );
  });

  it("adds a new import after the last import", () => {
    const r = insert(pass4, "ui_crdh1", 1, `<Input data-ui-id="ui_inp01" placeholder="Search" />`, {
      imports: [{ name: "Input", from: "@/components/ui/input" }],
    });
    const lastImport = linesOf(pass4, `import { formatStatus, statusBadgeVariant } from "@/lib/status";`);
    assertSurgical(pass4, r, [lastImport, linesOf(pass4, 'data-ui-id="ui_crdh1"', "</CardHeader>")]);
    expect(r.source).toContain(`import { formatStatus, statusBadgeVariant } from "@/lib/status";\nimport { Input } from "@/components/ui/input";\n`);
    expect(r.diff.linesAdded).toBe(2);
    expect(r.diff.linesRemoved).toBe(0);
  });

  it("merges into an existing import from the same module", () => {
    const r = insert(home, "ui_crd01", 2, `<CardFooter data-ui-id="ui_ftr01">Footer</CardFooter>`, {
      imports: [{ name: "CardFooter", from: "@/components/ui/card" }],
    });
    expect(r.source).toContain(`import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";`);
    assertSurgical(home, r, [linesOf(home, `from "@/components/ui/card"`), linesOf(home, 'data-ui-id="ui_crd01"', "</Card>")]);
  });

  it("skips imports that already exist and refuses conflicting ones", () => {
    const r = insert(home, "ui_act10", 0, `<Button data-ui-id="ui_bt999">A</Button>`, {
      imports: [{ name: "Button", from: "@/components/ui/button" }],
    });
    expect(r.diff.linesAdded).toBe(1);
    expect(() =>
      insert(home, "ui_act10", 0, `<Button data-ui-id="ui_bt999">A</Button>`, { imports: [{ name: "Button", from: "other" }] }),
    ).toThrow(/already imported from "@\/components\/ui\/button"/);
  });
});

describe("insert: template text is written verbatim (spike-log S1, S4)", () => {
  it("re-indents a formatted multi-line template exactly", () => {
    const template = [
      `<Stack data-ui-id="ui_ml001" direction="horizontal" className="gap-2">`,
      `  <Button data-ui-id="ui_ml002" variant="outline">`,
      `    Filter`,
      `  </Button>`,
      ``,
      `  <Button data-ui-id="ui_ml003">Sort</Button>`,
      `</Stack>`,
    ].join("\n");
    const r = insert(home, "ui_crdc1", 0, template);
    expect(r.source).toContain(
      [
        `        <CardContent data-ui-id="ui_crdc1">`,
        `          <Stack data-ui-id="ui_ml001" direction="horizontal" className="gap-2">`,
        `            <Button data-ui-id="ui_ml002" variant="outline">`,
        `              Filter`,
        `            </Button>`,
        ``,
        `            <Button data-ui-id="ui_ml003">Sort</Button>`,
        `          </Stack>`,
        `          <Table data-ui-id="ui_tbl01">`,
      ].join("\n"),
    );
  });

  it("keeps the template's own attribute layout", () => {
    const template = `<Stack\n  data-ui-id="ui_ml004"\n  direction="horizontal"\n  className="items-center justify-between pt-4"\n/>`;
    const r = insert(home, "ui_h0m3p", 1, template);
    expect(r.source).toContain(`      <Stack\n        data-ui-id="ui_ml004"\n        direction="horizontal"\n        className="items-center justify-between pt-4"\n      />\n`);
  });
});

describe("insert: import text placement", () => {
  it("appends to a multi-line import, keeping its layout", () => {
    const r = insert(home, "ui_tbl01", 2, `<TableFooter data-ui-id="ui_tf001" />`, {
      imports: [{ name: "TableFooter", from: "@/components/ui/table" }],
    });
    expect(r.source).toContain(`  TableRow,\n  TableFooter,\n} from "@/components/ui/table";`);
    expect(r.diff.linesAdded).toBe(2);
    expect(r.diff.linesRemoved).toBe(0);
  });
});

describe("attribute edits are text-level", () => {
  const src = [
    `import { Stack } from "@/components/layout";`,
    `export default function P() {`,
    `  return (`,
    `    <Stack`,
    `      data-ui-id="ui_aaaaa"`,
    `      direction='horizontal'`,
    `      onClick={() => go()}`,
    `      className="gap-2"`,
    `    >`,
    `      x`,
    `    </Stack>`,
    `  );`,
    `}`,
    ``,
  ].join("\n");

  it("changes one value in a multi-line tag and nothing else", () => {
    const r = setProp(src, "ui_aaaaa", "direction", "vertical");
    expect(r.diff.patch.split("\n").filter((l) => /^[-+] /.test(l))).toEqual([`-      direction='horizontal'`, `+      direction="vertical"`]);
  });

  it("removes an attribute line from a multi-line tag", () => {
    const r = setClass(src, "ui_aaaaa", [], ["gap-2"]);
    expect(r.source).toContain(`      onClick={() => go()}\n    >`);
    expect(r.diff.linesRemoved).toBe(1);
    expect(r.diff.linesAdded).toBe(0);
  });

  it("appends a new attribute after the last one", () => {
    expect(setProp(src, "ui_aaaaa", "wrap", true).source).toContain(`      className="gap-2" wrap={true}\n    >`);
  });

  it("writes values containing quotes as expressions", () => {
    expect(setProp(home, "ui_new0r", "title", `Say "hi"`).source).toContain(`title={"Say \\"hi\\""}`);
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildIdIndex, buildTree, findNodeById, parseModule, readRoutes, reason } from "@skeleton/core";
import { loadTemplate, renderProject } from "@skeleton/templates";
import type { Checker, Diagnostic } from "../src/project/checker.js";
import { Editor, EditRefused, EditRolledBack, listSources, type EditorIO } from "../src/project/editor.js";
import { listViolations } from "../src/project/violations.js";

const ROOT = "/projects/demo";

/** Every line outside the element with `id` is byte-identical before and after. */
function expectOnlyNodeChanged(before: string, after: string, id: string): void {
  const span = (src: string) => {
    const node = findNodeById(buildTree(src).roots, id);
    if (!node) throw new Error(`${id} not found`);
    return node.range;
  };
  const b = span(before);
  const a = span(after);
  const lb = before.split("\n");
  const la = after.split("\n");
  expect(la.slice(0, a.startLine - 1)).toEqual(lb.slice(0, b.startLine - 1));
  expect(la.slice(a.endLine)).toEqual(lb.slice(b.endLine));
}

/** An in-memory project: a freshly rendered template plus a second page. */
function memoryProject() {
  const files = new Map<string, string>();
  for (const [rel, content] of Object.entries(renderProject(loadTemplate(), { name: "Demo", skeletonVersion: "0" }))) {
    files.set(path.join(ROOT, rel), content);
  }
  files.set(path.join(ROOT, "src/pages/Other.tsx"), `export default function Other() {\n  return <div data-ui-id="ui_other" />;\n}\n`);
  const writes: string[] = [];
  const failWrites = new Set<string>();
  const io: EditorIO = {
    readFile: async (p) => {
      const content = files.get(p);
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
      return content;
    },
    writeFile: async (p, content) => {
      if (failWrites.has(p)) throw new Error(`disk full: ${p}`);
      writes.push(p);
      files.set(p, content);
    },
    deleteFile: async (p) => {
      if (!files.delete(p)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
      writes.push(`rm ${p}`);
    },
    listSources: async () =>
      [...files.keys()].filter((p) => p.startsWith(`${ROOT}/src/`) && /\.(tsx|jsx)$/.test(p)).map((p) => path.relative(ROOT, p)),
  };
  const home = () => files.get(path.join(ROOT, "src/pages/HomePage.tsx")) as string;
  const stackId = /<Stack data-ui-id="(ui_[a-z0-9]{5})"/.exec(home())?.[1] as string;
  return { files, io, writes, home, stackId, failWrites };
}

describe("Editor: insert (T3.2)", () => {
  it("places a palette entry with fresh IDs, its imports, and one minimal diff", async () => {
    const p = memoryProject();
    const before = p.home();
    const result = await new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "card" });
    const after = p.home();
    expect(p.writes).toEqual([path.join(ROOT, "src/pages/HomePage.tsx")]);
    expect(() => parseModule(after)).not.toThrow();
    expect(after).toContain('import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";');

    // The placed element is selected, is the stack's second child, and every new element has an ID.
    const card = findNodeById(buildTree(after).roots, result.select as string);
    expect(card?.name).toBe("Card");
    const stack = findNodeById(buildTree(after).roots, p.stackId);
    expect(stack?.children.map((c) => c.name)).toEqual(["h1", "Card"]);
    expect(card?.children.map((c) => c.name)).toEqual(["CardHeader", "CardContent"]);

    // Every pre-existing ID survives; new ones are unique project-wide.
    const beforeIds = [...buildIdIndex({ a: before }).ids.keys()];
    const index = buildIdIndex(Object.fromEntries([...p.files].filter(([f]) => f.endsWith(".tsx"))));
    for (const id of beforeIds) expect(index.ids.has(id), id).toBe(true);
    expect(index.duplicates).toEqual([]);
    expect(index.ids.size).toBe(beforeIds.length + 1 + 6); // Other's ID + 6 card elements

    // Only the import line and the inserted lines changed; the rest is byte-identical.
    expect(result.linesRemoved).toBe(0);
    expect(result.patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))).toEqual([]);
    const beforeLines = before.split("\n");
    const kept = after.split("\n").filter((l) => beforeLines.includes(l));
    expect(kept).toEqual(beforeLines);
  });

  it("formats the template and indents it under its parent", async () => {
    const p = memoryProject();
    await new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 0, paletteId: "button" });
    expect(p.home()).toMatch(/\n {8}<Button data-ui-id="ui_[a-z0-9]{5}">Button<\/Button>\n {8}<h1 /);
  });

  it("mints IDs that don't clash with other pages", async () => {
    const p = memoryProject();
    const random = Math.random;
    // Force the first minted candidate to collide with Other.tsx's ID.
    const sequence = [..."other"].map((c) => "abcdefghijklmnopqrstuvwxyz0123456789".indexOf(c) / 36 + 0.001);
    Math.random = () => sequence.shift() ?? random();
    try {
      const result = await new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 0, paletteId: "badge" });
      expect(result.select).not.toBe("ui_other");
    } finally {
      Math.random = random;
    }
  });

  it("refuses an insert into a missing or locked target without writing", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: "ui_zzzzz", index: 0, paletteId: "button" })).rejects.toThrow(
      new EditRefused("insert(ui_zzzzz): ui_zzzzz not found", { reason: reason("element-gone", { id: "ui_zzzzz" }) }),
    );
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 9, paletteId: "button" })).rejects.toThrow(
      /index 9 out of range/,
    );
    expect(p.writes).toEqual([]);
  });

  it("applies queued edits in order, each on the previous result", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await Promise.all([
      editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "button" }),
      editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "badge" }).catch((e: unknown) => e),
      editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 99, paletteId: "badge" }).catch((e: unknown) => e),
      editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 3, paletteId: "separator" }),
    ]);
    const stack = findNodeById(buildTree(p.home()).roots, p.stackId);
    expect(stack?.children.map((c) => c.name)).toEqual(["h1", "Badge", "Button", "Separator"]);
  });
});

describe("Editor: move (T3.3)", () => {
  it("moves a node by ID and keeps it selected; the rest of the file is untouched", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const placed = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "button" });
    const before = p.home();
    const h1 = findNodeById(buildTree(before).roots, p.stackId)?.children[0]?.id as string;
    const result = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "move", ref: { id: placed.select as string }, newParentId: p.stackId, index: 0 });
    expect(result.select).toBe(placed.select);
    const stack = findNodeById(buildTree(p.home()).roots, p.stackId);
    expect(stack?.children.map((c) => c.id)).toEqual([placed.select, h1]);
    expect(p.home().split("\n").sort()).toEqual(before.split("\n").sort());
  });

  it("moves an un-ID'd locked block by position, verbatim", async () => {
    const p = memoryProject();
    const page = path.join(ROOT, "src/pages/HomePage.tsx");
    const withMap = p.home().replace(
      "      </Stack>",
      `        {["a", "b"].map((x) => (\n          <p key={x} data-ui-id="ui_row01">\n            {x}\n          </p>\n        ))}\n      </Stack>`,
    );
    p.files.set(page, withMap);
    const result = await new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "move", ref: { parentId: p.stackId, index: 1 }, newParentId: p.stackId, index: 0 });
    expect(result.select).toBeNull();
    const stack = findNodeById(buildTree(p.home()).roots, p.stackId);
    expect(stack?.children.map((c) => c.name)).toEqual(["map", "h1"]);
    expect(p.home()).toContain(`        {["a", "b"].map((x) => (\n          <p key={x} data-ui-id="ui_row01">`);
  });

  it("refuses to move a node into itself, without writing", async () => {
    const p = memoryProject();
    const container = /<Container data-ui-id="(ui_[a-z0-9]{5})"/.exec(p.home())?.[1] as string;
    await expect(
      new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "move", ref: { id: p.stackId }, newParentId: p.stackId, index: 0 }),
    ).rejects.toThrow(EditRefused);
    await expect(
      new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "move", ref: { id: container }, newParentId: p.stackId, index: 0 }),
    ).rejects.toThrow(/root and has no parent/);
    expect(p.writes).toEqual([]);
  });
});

describe("Editor: remove (T3.4)", () => {
  const withLogic = (home: string) =>
    home.replace(
      "      </Stack>",
      `        <button data-ui-id="ui_btn01" onClick={() => alert("hi")}>\n          Hi\n        </button>\n        {["a"].map((x) => (\n          <p key={x} data-ui-id="ui_row01">\n            {x}\n          </p>\n        ))}\n      </Stack>`,
    );

  it("removes a node and only its lines", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const placed = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "card" });
    const before = p.home();
    const result = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { id: placed.select as string }, allowLocked: false });
    expect(result.linesAdded).toBe(0);
    expect(findNodeById(buildTree(p.home()).roots, placed.select as string)).toBeNull();
    const after = p.home().split("\n");
    expect(before.split("\n").filter((l) => !after.includes(l)).every((l) => /Card|<p|<\/p>|content/.test(l))).toBe(true);
  });

  it("asks for confirmation before removing agent logic, then removes it", async () => {
    const p = memoryProject();
    p.files.set(path.join(ROOT, "src/pages/HomePage.tsx"), withLogic(p.home()));
    const editor = new Editor(p.io);
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { id: "ui_btn01" }, allowLocked: false })).rejects.toThrow(/agent logic/);
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { parentId: p.stackId, index: 2 }, allowLocked: false })).rejects.toThrow(
      EditRefused,
    );
    expect(p.writes).toEqual([]);
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { parentId: p.stackId, index: 2 }, allowLocked: true });
    expect(p.home()).not.toContain(".map(");
    expect(p.home()).toContain(`onClick={() => alert("hi")}`);
  });

  it("refuses to remove an element wrapped by a locked block", async () => {
    const p = memoryProject();
    p.files.set(path.join(ROOT, "src/pages/HomePage.tsx"), withLogic(p.home()));
    await expect(new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { id: "ui_row01" }, allowLocked: true })).rejects.toThrow(
      /wrapped by locked map/,
    );
  });
});

describe("Editor: properties (T3.5)", () => {
  it("sets props, text and classes, changing only the element", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const placed = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "button" });
    const id = placed.select as string;
    const run = async (edit: Parameters<Editor["apply"]>[2]) => {
      const before = p.home();
      const r = await editor.apply(ROOT, "src/pages/HomePage.tsx", edit);
      expect(r.select).toBe(id);
      expectOnlyNodeChanged(before, p.home(), id);
    };
    await run({ op: "setProp", id, key: "variant", value: "outline" });
    // Prettier puts the text on its own line once there's a second attribute.
    expect(p.home()).toContain(`        <Button data-ui-id="${id}" variant="outline">\n          Button\n        </Button>\n`);
    await run({ op: "setText", id, text: "Save" });
    await run({ op: "setClass", id, add: ["w-full"], remove: [] });
    await run({ op: "setProp", id, key: "variant", value: null });
    expect(p.home()).toContain(`        <Button data-ui-id="${id}" className="w-full">\n          Save\n        </Button>\n`);
  });

  it("refuses protected props with the op's message", async () => {
    const p = memoryProject();
    await expect(new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", { op: "setProp", id: p.stackId, key: "onClick", value: "x" })).rejects.toThrow(
      /setProp\(.+\): prop "onClick" cannot be set/,
    );
  });
});

describe("Editor: pages (T3.6)", () => {
  const abs = (rel: string) => path.join(ROOT, rel);
  const routes = (p: ReturnType<typeof memoryProject>) => readRoutes(p.files.get(abs("src/router.tsx")) as string).routes.map((r) => [r.path, r.file]);

  it("adds a page: a new page file and one route", async () => {
    const p = memoryProject();
    const result = await new Editor(p.io).page(ROOT, { op: "addPage", name: "Order history", path: "/orders" });
    expect(result).toEqual({ path: "/orders", files: ["src/pages/OrderHistoryPage.tsx", "src/router.tsx"], unchecked: "no typechecker" });
    expect(routes(p)).toEqual([
      ["/", "src/pages/HomePage.tsx"],
      ["/orders", "src/pages/OrderHistoryPage.tsx"],
    ]);
    const page = p.files.get(abs("src/pages/OrderHistoryPage.tsx")) as string;
    expect(page).toContain("export default function OrderHistoryPage() {");
    const index = buildIdIndex(Object.fromEntries([...p.files].filter(([f]) => f.endsWith(".tsx"))));
    expect(index.duplicates).toEqual([]);
  });

  it("renames a page's path, and its name, component and file", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await editor.page(ROOT, { op: "addPage", name: "Orders", path: "/orders" });
    await editor.page(ROOT, { op: "renamePage", path: "/orders", name: null, newPath: "/sales" });
    expect(routes(p)).toContainEqual(["/sales", "src/pages/OrdersPage.tsx"]);
    const ids = (f: string) => [...buildIdIndex({ f: p.files.get(abs(f)) as string }).ids.keys()];
    const before = ids("src/pages/OrdersPage.tsx");
    const r = await editor.page(ROOT, { op: "renamePage", path: "/sales", name: "Sales", newPath: null });
    expect(r.path).toBe("/sales");
    expect(routes(p)).toContainEqual(["/sales", "src/pages/SalesPage.tsx"]);
    expect(p.files.has(abs("src/pages/OrdersPage.tsx"))).toBe(false);
    expect(p.files.get(abs("src/pages/SalesPage.tsx"))).toContain("export default function SalesPage() {");
    expect(ids("src/pages/SalesPage.tsx")).toEqual(before);
  });

  it("deletes a page's route and file, but never the last page or one other code imports", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await expect(editor.page(ROOT, { op: "deletePage", path: "/" })).rejects.toThrow(/only page/);
    await editor.page(ROOT, { op: "addPage", name: "Orders", path: "/orders" });
    p.files.set(abs("src/pages/Other.tsx"), `import OrdersPage from "./OrdersPage";\nexport default function Other() {\n  return <OrdersPage />;\n}\n`);
    await expect(editor.page(ROOT, { op: "deletePage", path: "/orders" })).rejects.toThrow(/imported by src\/pages\/Other.tsx/);
    await expect(editor.page(ROOT, { op: "renamePage", path: "/orders", name: "Sales", newPath: null })).rejects.toThrow(/imported by/);
    p.files.delete(abs("src/pages/Other.tsx"));
    const r = await editor.page(ROOT, { op: "deletePage", path: "/orders" });
    expect(r.path).toBe("/");
    expect(routes(p)).toEqual([["/", "src/pages/HomePage.tsx"]]);
    expect(p.files.has(abs("src/pages/OrdersPage.tsx"))).toBe(false);
  });

  it("refuses bad names, taken paths and existing files, writing nothing", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await expect(editor.page(ROOT, { op: "addPage", name: "2 Orders", path: "/orders" })).rejects.toThrow(EditRefused);
    await expect(editor.page(ROOT, { op: "addPage", name: "Orders", path: "/" })).rejects.toThrow(/already a route for \//);
    await expect(editor.page(ROOT, { op: "addPage", name: "Orders", path: "/Orders" })).rejects.toThrow(/isn't a page path/);
    await expect(editor.page(ROOT, { op: "addPage", name: "Home", path: "/home" })).rejects.toThrow(/HomePage is already used/);
    expect(p.writes).toEqual([]);
  });

  it("rolls back a page op when a write fails, so it never half-happens", async () => {
    const p = memoryProject();
    const router = p.files.get(abs("src/router.tsx"));
    p.failWrites.add(abs("src/router.tsx"));
    await expect(new Editor(p.io).page(ROOT, { op: "addPage", name: "Orders", path: "/orders" })).rejects.toThrow(/disk full/);
    expect(p.files.has(abs("src/pages/OrdersPage.tsx"))).toBe(false);
    expect(p.files.get(abs("src/router.tsx"))).toBe(router);
  });
});

describe("Editor: post-edit pipeline (T3.7)", () => {
  /** A checker that reports an error for every file containing `marker`, plus any `standing` ones. */
  function fakeChecker(p: ReturnType<typeof memoryProject>, marker: string, standing: Diagnostic[] = []) {
    let checks = 0;
    const checker: Checker = {
      check: async () => {
        checks++;
        const errors = [...standing];
        for (const [file, text] of p.files) {
          if (text.includes(marker)) errors.push({ file: path.relative(ROOT, file), line: 1, code: 2322, message: `found ${marker}` });
        }
        return errors;
      },
      dispose: () => undefined,
    };
    return { checker, checks: () => checks };
  }

  it("rolls back an edit that breaks the typecheck, restoring the file exactly", async () => {
    const p = memoryProject();
    const { checker, checks } = fakeChecker(p, `direction="sideways"`);
    const before = p.home();
    const editor = new Editor(p.io, { checker: () => checker });
    const error = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "setProp", id: p.stackId, key: "direction", value: "sideways" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EditRolledBack);
    expect((error as EditRolledBack).message).toMatch(/undone because it broke the typecheck:\nsrc\/pages\/HomePage.tsx:1: found/);
    expect(p.home()).toBe(before);
    expect(checks()).toBe(3); // before, after, and after the rollback
  });

  it("doesn't block edits on errors the project already had", async () => {
    const p = memoryProject();
    const { checker } = fakeChecker(p, "nothing-matches", [{ file: "src/other.ts", line: 3, code: 2304, message: "Cannot find name 'x'." }]);
    const result = await new Editor(p.io, { checker: () => checker }).apply(ROOT, "src/pages/HomePage.tsx", {
      op: "setProp",
      id: p.stackId,
      key: "direction",
      value: "horizontal",
    });
    expect(result.unchecked).toBeNull();
    expect(p.home()).toContain(`direction="horizontal"`);
  });

  it("keeps the edit but says so when the project can't be checked", async () => {
    const p = memoryProject();
    const checker: Checker = { check: async () => Promise.reject(new Error("TypeScript isn't installed")), dispose: () => undefined };
    const result = await new Editor(p.io, { checker: () => checker }).apply(ROOT, "src/pages/HomePage.tsx", { op: "setText", id: p.stackId, text: "x" }).catch((e: unknown) => e);
    // (A Stack has child elements, so setText refuses before anything is checked.)
    expect(result).toBeInstanceOf(EditRefused);
    const ok = await new Editor(p.io, { checker: () => checker }).apply(ROOT, "src/pages/HomePage.tsx", { op: "setClass", id: p.stackId, add: ["gap-8"], remove: ["gap-6"] });
    expect(ok.unchecked).toBe("TypeScript isn't installed");
    expect(p.home()).toContain("gap-8");
  });

  it("rolls back a whole page op, deleting the file it created", async () => {
    const p = memoryProject();
    const { checker } = fakeChecker(p, "<OrdersPage />");
    await expect(new Editor(p.io, { checker: () => checker }).page(ROOT, { op: "addPage", name: "Orders", path: "/orders" })).rejects.toThrow(EditRolledBack);
    expect(p.files.has(path.join(ROOT, "src/pages/OrdersPage.tsx"))).toBe(false);
    expect(p.files.get(path.join(ROOT, "src/router.tsx"))).not.toContain("OrdersPage");
  });

  it("never clobbers a file that changed after the edit", async () => {
    const p = memoryProject();
    const page = path.join(ROOT, "src/pages/HomePage.tsx");
    let calls = 0;
    const checker: Checker = {
      check: async () => {
        calls++;
        if (calls === 2) {
          // Someone saves the file between the write and the check.
          p.files.set(page, (p.files.get(page) as string).replace("gap-6", "gap-2"));
          return [{ file: "src/pages/HomePage.tsx", line: 1, code: 1, message: "broken" }];
        }
        return [];
      },
      dispose: () => undefined,
    };
    await expect(new Editor(p.io, { checker: () => checker }).apply(ROOT, "src/pages/HomePage.tsx", { op: "setClass", id: p.stackId, add: ["w-full"], remove: [] })).rejects.toThrow(EditRolledBack);
    expect(p.home()).toContain("gap-2");
    expect(p.home()).toContain("w-full");
  });

  it("formats an opening tag that an attribute edit pushed past the print width", async () => {
    const p = memoryProject();
    const r = await new Editor(p.io).apply(ROOT, "src/pages/HomePage.tsx", {
      op: "setClass",
      id: p.stackId,
      add: ["items-center", "justify-between", "flex-wrap", "px-10"],
      remove: [],
    });
    expect(p.home()).toContain(`      <Stack\n        data-ui-id="${p.stackId}"\n        className="gap-6 py-8 items-center justify-between flex-wrap px-10"\n      >`);
    expect(r.linesRemoved).toBe(1);
    expect(r.linesAdded).toBe(4);
  });
});

describe("Editor: undo and redo (T3.8)", () => {
  it("undoes and redoes edits in order, restoring each file exactly", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const v0 = p.home();
    const card = await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "card" });
    const v1 = p.home();
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "setClass", id: card.select as string, add: ["w-full"], remove: [] });
    const v2 = p.home();
    expect(await editor.history(ROOT)).toEqual({ undo: "Change layout of Card", redo: null });

    expect(await editor.undo(ROOT)).toMatchObject({ label: "Change layout of Card", files: ["src/pages/HomePage.tsx"], history: { undo: "Insert Card", redo: "Change layout of Card" } });
    expect(p.home()).toBe(v1);
    await editor.undo(ROOT);
    expect(p.home()).toBe(v0);
    await expect(editor.undo(ROOT)).rejects.toThrow(/nothing to undo/);
    await editor.redo(ROOT);
    expect(p.home()).toBe(v1);
    await editor.redo(ROOT);
    expect(p.home()).toBe(v2);
    await expect(editor.redo(ROOT)).rejects.toThrow(/nothing to redo/);
  });

  it("drops the redo stack on a new edit", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "badge" });
    await editor.undo(ROOT);
    expect((await editor.history(ROOT)).redo).toBe("Insert Badge");
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "button" });
    expect(await editor.history(ROOT)).toEqual({ undo: "Insert Button", redo: null });
  });

  it("won't overwrite changes made outside Skeleton since", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "insert", parentId: p.stackId, index: 1, paletteId: "badge" });
    const page = path.join(ROOT, "src/pages/HomePage.tsx");
    p.files.set(page, (p.files.get(page) as string).replace("gap-6", "gap-2"));
    await expect(editor.undo(ROOT)).rejects.toThrow(/can't undo "Insert Badge": src\/pages\/HomePage.tsx changed since/);
    expect(p.home()).toContain("gap-2");
    expect((await editor.history(ROOT)).undo).toBe("Insert Badge");
  });

  it("undoes a page op across files: the page file goes, the router comes back", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const router = p.files.get(path.join(ROOT, "src/router.tsx"));
    await editor.page(ROOT, { op: "addPage", name: "Orders", path: "/orders" });
    const undone = await editor.undo(ROOT);
    expect(undone.label).toBe("Add page /orders");
    expect(undone.files.sort()).toEqual(["src/pages/OrdersPage.tsx", "src/router.tsx"]);
    expect(p.files.has(path.join(ROOT, "src/pages/OrdersPage.tsx"))).toBe(false);
    expect(p.files.get(path.join(ROOT, "src/router.tsx"))).toBe(router);
    await editor.redo(ROOT);
    expect(p.files.get(path.join(ROOT, "src/pages/OrdersPage.tsx"))).toContain("export default function OrdersPage");
  });

  it("doesn't record refused or rolled-back edits", async () => {
    const p = memoryProject();
    const checker: Checker = {
      check: async () => ((p.files.get(path.join(ROOT, "src/pages/HomePage.tsx")) as string).includes("sideways") ? [{ file: "x", line: 1, code: 1, message: "bad" }] : []),
      dispose: () => undefined,
    };
    const editor = new Editor(p.io, { checker: () => checker });
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "setProp", id: p.stackId, key: "direction", value: "sideways" })).rejects.toThrow(EditRolledBack);
    await expect(editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "remove", ref: { id: "ui_zzzzz" }, allowLocked: false })).rejects.toThrow(EditRefused);
    expect(await editor.history(ROOT)).toEqual({ undo: null, redo: null });
  });
});

describe("Editor: tokens (T4.1)", () => {
  const CSS = path.join(ROOT, "src/styles/globals.css");

  it("writes one token through the token writer, as one undoable step", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const before = p.files.get(CSS) as string;
    await editor.tokens(ROOT, [{ name: "--radius-button", value: "calc(var(--radius) * 1.2)", mode: null }]);
    const after = p.files.get(CSS) as string;
    const changed = after.split("\n").filter((l, i) => l !== before.split("\n")[i]);
    expect(changed).toEqual(["  --radius-button: calc(var(--radius) * 1.2);"]);
    expect(await editor.history(ROOT)).toEqual({ undo: "Set --radius-button", redo: null });
    await editor.undo(ROOT);
    expect(p.files.get(CSS)).toBe(before);
  });

  it("writes dark values to .dark, and refuses unknown tokens without writing", async () => {
    const p = memoryProject();
    const editor = new Editor(p.io);
    await editor.tokens(ROOT, [{ name: "--primary", value: "oklch(0.6 0.2 250)", mode: "dark" }]);
    const css = p.files.get(CSS) as string;
    expect(css.slice(css.indexOf(".dark {"))).toContain("--primary: oklch(0.6 0.2 250);");
    expect(css.slice(0, css.indexOf(".dark {"))).toContain("--primary: oklch(0.205 0 0);");
    expect(await editor.history(ROOT)).toMatchObject({ undo: "Set --primary (dark)" });
    p.writes.length = 0;
    await expect(editor.tokens(ROOT, [{ name: "--nope", value: "1px", mode: null }])).rejects.toThrow(EditRefused);
    expect(p.writes).toEqual([]);
  });
});

describe("Editor: violations (T4.6)", () => {
  const CSS = path.join(ROOT, "src/styles/globals.css");
  const CONFIG = path.join(ROOT, "skeleton/config.json");
  async function withViolations() {
    const p = memoryProject();
    const editor = new Editor(p.io);
    const h1 = /<h1 data-ui-id="(ui_[a-z0-9]{5})"/.exec(p.home())?.[1] as string;
    await editor.apply(ROOT, "src/pages/HomePage.tsx", { op: "setClass", id: h1, add: ["rounded-[14px]", "text-[17px]"], remove: [] });
    const list = async () => (await listViolations(p.io, ROOT)).items;
    return { p, editor, h1, list };
  }

  it("lists violations with their element, property and nearest token", async () => {
    const { h1, list } = await withViolations();
    const items = await list();
    expect(items.map((v) => [v.value, v.element?.id, v.property, v.nearest?.utility, v.editable, v.kept])).toEqual([
      ["rounded-[14px]", h1, "radius", "rounded-xl", true, false],
      ["text-[17px]", h1, "font-size", "text-base", true, false],
    ]);
  });

  it("promotes an override to a new token and uses it, as one undoable step", async () => {
    const { p, editor, h1, list } = await withViolations();
    const [radius] = await list();
    const cssBefore = p.files.get(CSS) as string;
    const pageBefore = p.home();
    expect(await editor.promote(ROOT, { file: "src/pages/HomePage.tsx", offset: radius!.offset, value: "rounded-[14px]" }, "hero")).toEqual({ utility: "rounded-hero" });
    expect((p.files.get(CSS) as string).split("\n").filter((l) => !cssBefore.split("\n").includes(l))).toEqual(["  --radius-hero: 0.875rem;"]);
    expect(findNodeById(buildTree(p.home()).roots, h1)?.props["className"]).toBe("text-3xl font-semibold rounded-hero text-[17px]");
    expect((await list()).map((v) => v.value)).toEqual(["text-[17px]"]);
    expect(await editor.history(ROOT)).toMatchObject({ undo: "Promote rounded-[14px] to a token" });
    await editor.undo(ROOT);
    expect(p.files.get(CSS)).toBe(cssBefore);
    expect(p.home()).toBe(pageBefore);
  });

  it("refuses a stale reference or a taken name, writing nothing", async () => {
    const { p, editor, list } = await withViolations();
    const [radius] = await list();
    p.writes.length = 0;
    await expect(editor.promote(ROOT, { file: "src/pages/HomePage.tsx", offset: radius!.offset + 1, value: "rounded-[14px]" }, "hero")).rejects.toThrow(/out of date/);
    await expect(editor.promote(ROOT, { file: "src/pages/HomePage.tsx", offset: radius!.offset, value: "rounded-[14px]" }, "card")).rejects.toThrow(/already exists/);
    expect(p.writes).toEqual([]);
  });

  it("keeps a violation in skeleton/config.json, once", async () => {
    const { p, editor, h1, list } = await withViolations();
    const [, text] = await list();
    const ref = { file: "src/pages/HomePage.tsx", offset: text!.offset, value: "text-[17px]" };
    await editor.keep(ROOT, ref);
    await editor.keep(ROOT, ref);
    const config = JSON.parse(p.files.get(CONFIG) as string) as { name: string; acknowledgedViolations: unknown[] };
    expect(config.name).toBe("Demo");
    expect(config.acknowledgedViolations).toEqual([{ file: "src/pages/HomePage.tsx", id: h1, value: "text-[17px]" }]);
    expect((await list()).map((v) => [v.value, v.kept])).toEqual([
      ["rounded-[14px]", false],
      ["text-[17px]", true],
    ]);
    expect(await editor.history(ROOT)).toMatchObject({ undo: "Keep text-[17px]" });
  });
});

describe("listSources", () => {
  it("walks src/ for .tsx and .jsx, skipping node_modules, dist and dotfiles", async () => {
    const tree: Record<string, { name: string; dir: boolean }[]> = {
      "/p/src": [
        { name: "main.tsx", dir: false },
        { name: "pages", dir: true },
        { name: "node_modules", dir: true },
        { name: ".cache", dir: true },
        { name: "styles.css", dir: false },
      ],
      "/p/src/pages": [
        { name: "Home.tsx", dir: false },
        { name: "Old.jsx", dir: false },
        { name: "util.ts", dir: false },
      ],
    };
    const readdir = async (dir: string) => (tree[dir] ?? []).map((e) => ({ name: e.name, isDirectory: () => e.dir }));
    await expect(listSources("/p", readdir)).resolves.toEqual(["src/main.tsx", "src/pages/Home.tsx", "src/pages/Old.jsx"]);
  });
});

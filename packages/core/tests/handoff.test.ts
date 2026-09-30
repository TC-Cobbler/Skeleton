import { describe, expect, it } from "vitest";
import {
  analyseTakeBack,
  applyNoteOp,
  changesSince,
  compileHandoff,
  contractBreaches,
  parseHandoff,
  takeBackNotes,
  writeTokens,
  type Note,
  type NotesFile,
} from "../src/index.js";
import { readFixtureSnapshot } from "./helpers.js";

const base = readFixtureSnapshot("base");
const HOME = "src/pages/HomePage.tsx";
const CSS = "src/styles/globals.css";
const ROUTER = "src/router.tsx";
const now = "2026-09-30T12:00:00.000Z";

function notes(...specs: [string, Note["type"], string][]): NotesFile {
  let file: NotesFile = { notes: [], replies: [] };
  for (const [target, type, text] of specs) file = applyNoteOp(file, { op: "add", target, type, text }, { now }).file;
  return { ...file, notes: file.notes.map((n) => ({ ...n, handoff: 2 })) };
}

describe("changesSince (T5.2)", () => {
  it("lists pages, tokens and elements added and removed", () => {
    const after = {
      ...base,
      [ROUTER]: (base[ROUTER] as string).replace(
        '  { path: "/", element: <HomePage /> },\n',
        '  { path: "/", element: <HomePage /> },\n  { path: "/orders", element: <OrdersPage /> },\n',
      ).replace('import HomePage from "./pages/HomePage";', 'import HomePage from "./pages/HomePage";\nimport OrdersPage from "./pages/OrdersPage";'),
      [CSS]: writeTokens(base[CSS] as string, [{ name: "--radius-card", value: "calc(var(--radius) * 2)" }]),
      [HOME]: (base[HOME] as string)
        .replace('<Button data-ui-id="ui_new0r">New order</Button>', '<Button data-ui-id="ui_new0r">New order</Button>\n        <Button data-ui-id="ui_abc12">More</Button>')
        .replace(/\s*<Button data-ui-id="ui_exp0r"[\s\S]*?<\/Button>/, ""),
    };
    const c = changesSince(base, after);
    expect(c.pagesAdded).toEqual(["/orders"]);
    expect(c.pagesRemoved).toEqual([]);
    expect(c.tokens).toEqual([{ name: "--radius-card", block: "theme-inline", before: "calc(var(--radius) * 1.25)", after: "calc(var(--radius) * 2)" }]);
    expect(c.elementsAdded).toEqual([{ id: "ui_abc12", element: "Button", file: HOME, line: 21 }]);
    expect(c.elementsRemoved.map((e) => e.id)).toEqual(["ui_exp0r"]);
    expect(c.unreadable).toEqual([]);
  });

  it("reports a page that doesn't parse, rather than skipping it quietly", () => {
    const c = changesSince(base, { ...base, [HOME]: "export default function (" });
    expect(c.unreadable.map((u) => u.file)).toEqual([HOME]);
  });
});

describe("compileHandoff / parseHandoff (T5.2, T5.3)", () => {
  const file = notes(["ui_tbl01", "build", "Load orders from /api/orders; paginate 20/page"], ["ui_new0r", "behaviour", "Opens the New order dialog"], ["ui_tbl01", "question", "Should the empty state show a CTA?"]);
  const md = compileHandoff({
    number: 2,
    date: "2026-09-28 23:50",
    changes: {
      pagesAdded: ["/orders"],
      pagesRemoved: [],
      tokens: [{ name: "--radius-card", block: "theme-inline", before: "12px", after: "16px" }, { name: "--primary", block: "dark", before: "a", after: "b" }],
      elementsAdded: [{ id: "ui_7f3k2", element: "Table", file: "src/pages/OrdersPage.tsx", line: 3 }],
      elementsRemoved: [],
      unreadable: [],
    },
    tasks: file.notes,
  });

  it("writes the PRD §12.2 format", () => {
    expect(md).toBe(
      [
        "# Handoff #2 — 2026-09-28 23:50",
        "",
        "## Changes since last handoff",
        "- Added pages: /orders",
        "- Token changes: --radius-card 12px → 16px; --primary (dark) a → b",
        "- New elements: ui_7f3k2 (Table in OrdersPage)",
        "",
        "## Tasks",
        "- [ ] ui_tbl01 · Build · Load orders from /api/orders; paginate 20/page",
        "- [ ] ui_new0r · Behaviour · Opens the New order dialog",
        "- [ ] ui_tbl01 · Question · Should the empty state show a CTA?",
        "",
        "## Agent replies",
        "<!-- Agent: tick tasks above and add replies here, keyed by data-ui-id -->",
        "",
      ].join("\n"),
    );
  });

  it("reads back its own tasks, unticked", () => {
    const parsed = parseHandoff(md);
    expect(parsed.number).toBe(2);
    expect(parsed.tasks).toEqual([
      { done: false, target: "ui_tbl01", type: "build", text: "Load orders from /api/orders; paginate 20/page" },
      { done: false, target: "ui_new0r", type: "behaviour", text: "Opens the New order dialog" },
      { done: false, target: "ui_tbl01", type: "question", text: "Should the empty state show a CTA?" },
    ]);
    expect(parsed.replies).toEqual([]);
  });

  it("reads an agent's ticks and replies, with the liberties agents take", () => {
    const agent = md
      .replace("- [ ] ui_tbl01 · Build", "- [x] ui_tbl01 · Build")
      .replace("- [ ] ui_new0r · Behaviour · Opens the New order dialog", "* [X] `ui_new0r` · Behavior · Opens the new-order dialog (reworded)")
      .concat(
        [
          "- ui_tbl01 · Loads from /api/orders via useOrders();",
          "  empty state needs design",
          "- **ui_new0r**: opens NewOrderDialog (ui_d1a0g)",
          "- ui_aaaaa, ui_bbbbb — new filter elements",
          "- No new tokens needed.",
          "Also: pagination is client-side for now.",
          "",
        ].join("\n"),
      );
    const parsed = parseHandoff(agent);
    expect(parsed.tasks.map((t) => [t.done, t.target, t.type])).toEqual([
      [true, "ui_tbl01", "build"],
      [true, "ui_new0r", "behaviour"],
      [false, "ui_tbl01", "question"],
    ]);
    expect(parsed.replies).toEqual([
      { target: "ui_tbl01", text: "Loads from /api/orders via useOrders(); empty state needs design" },
      { target: "ui_new0r", text: "opens NewOrderDialog (ui_d1a0g)" },
      { target: "ui_aaaaa", text: "new filter elements" },
      { target: "ui_bbbbb", text: "new filter elements" },
      { target: null, text: "No new tokens needed." },
      { target: null, text: "Also: pagination is client-side for now." },
    ]);

    // Ticks resolve notes: the first by its text, the reworded one by position.
    const back = takeBackNotes(file, parsed, 2);
    expect(back.resolved).toEqual([file.notes[0]?.id, file.notes[1]?.id]);
    expect(back.unmatched).toEqual([]);
    expect(back.file.notes.map((n) => n.status)).toEqual(["resolved", "resolved", "open"]);
    expect(back.replies).toBe(6);
    expect(back.file.replies[0]).toEqual({ target: "ui_tbl01", text: "Loads from /api/orders via useOrders(); empty state needs design", pass: 2 });
  });

  it("only resolves notes sent in that handoff", () => {
    const older = { ...file, notes: file.notes.map((n) => ({ ...n, handoff: 1 })) };
    const back = takeBackNotes(older, parseHandoff(md.replace("- [ ] ui_tbl01 · Build", "- [x] ui_tbl01 · Build")), 2);
    expect(back.resolved).toEqual([]);
    expect(back.unmatched.map((t) => t.target)).toEqual(["ui_tbl01"]);
  });
});

describe("contractBreaches (T5.4)", () => {
  it("maps the analyser's findings and the pass's files to contract rules", () => {
    const after = {
      ...base,
      [HOME]: (base[HOME] as string)
        .replace(' data-ui-id="ui_exp0r"', "")
        .replace('className="gap-6 p-8"', 'className="gap-6 p-[13px]"'),
      [CSS]: writeTokens(base[CSS] as string, [{ name: "--radius", value: "1rem", block: "light" }]),
    };
    const report = analyseTakeBack(base, after);
    const breaches = contractBreaches(report, {
      files: [
        { path: HOME, status: "modified" },
        { path: "skeleton/notes.json", status: "modified" },
      ],
      unreported: true,
    });
    expect(breaches.map((b) => [b.rule, b.text])).toEqual([
      [1, "ui_exp0r (Button) was removed or changed"],
      [1, "<Button> has no data-ui-id"],
      [2, "p-[13px]"],
      [3, "--radius: 0.625rem → 1rem"],
      [6, "skeleton/notes.json was modified (Skeleton's own folder)"],
      [7, "HANDOFF.md came back with no ticks and no replies"],
    ]);
  });

  it("finds nothing in a clean pass", () => {
    expect(contractBreaches(analyseTakeBack(base, base), { files: [], unreported: false })).toEqual([]);
  });
});

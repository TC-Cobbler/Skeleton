import { describe, expect, it } from "vitest";
import type { NoteView, NotesView, UiNode } from "@skeleton/app-main/ipc";
import type { KeyedNode } from "../src/canvas/nodes.js";
import { filterNotes, looseReplies, pinsFor, repliesFor } from "../src/notes.js";

const note = (over: Partial<NoteView>): NoteView => ({
  id: "n_aaaaaa",
  target: "ui_aaaaa",
  type: "build",
  text: "x",
  status: "open",
  created: "",
  handoff: null,
  orphaned: false,
  element: "div",
  file: "src/pages/HomePage.tsx",
  ...over,
});
const node = (key: string, id: string | null): KeyedNode => ({ key, depth: 0, node: { id } as UiNode });

const view: NotesView = {
  notes: [
    note({ id: "n_000001", target: "ui_aaaaa", type: "question", status: "resolved" }),
    note({ id: "n_000002", target: "ui_aaaaa", type: "behaviour" }),
    note({ id: "n_000003", target: "ui_bbbbb", status: "resolved" }),
    note({ id: "n_000004", target: "ui_gone0", orphaned: true, element: null, file: null }),
  ],
  replies: [
    { target: "ui_aaaaa", text: "old", pass: 1 },
    { target: "ui_ccccc", text: "new element", pass: 2 },
    { target: null, text: "general", pass: 2 },
    { target: "ui_aaaaa", text: "new", pass: 2 },
  ],
};

describe("notes in the UI (T5.1)", () => {
  it("filters by type, status and element, open first, orphans left to the tray", () => {
    const ids = (f: Parameters<typeof filterNotes>[1]) => filterNotes(view.notes, f).map((n) => n.id);
    expect(ids({ type: "all", status: "all", target: null })).toEqual(["n_000002", "n_000001", "n_000003"]);
    expect(ids({ type: "all", status: "open", target: null })).toEqual(["n_000002"]);
    expect(ids({ type: "build", status: "all", target: null })).toEqual(["n_000003"]);
    expect(ids({ type: "all", status: "all", target: "ui_aaaaa" })).toEqual(["n_000002", "n_000001"]);
  });

  it("groups replies by element, newest first", () => {
    expect(repliesFor(view.replies, "ui_aaaaa").map((r) => r.text)).toEqual(["new", "old"]);
    expect(looseReplies(view).map((r) => r.text)).toEqual(["new element", "general"]);
  });

  it("pins each element on the page with notes or replies", () => {
    const nodes = [node("0", "ui_aaaaa"), node("0.0", "ui_bbbbb"), node("0.1", "ui_ccccc"), node("0.2", null)];
    expect(pinsFor(view, nodes)).toEqual([
      { key: "0", open: 1, total: 2, type: "behaviour", replied: true },
      { key: "0.0", open: 0, total: 1, type: "build", replied: false },
      { key: "0.1", open: 0, total: 0, type: "build", replied: true },
    ]);
    expect(pinsFor(null, nodes)).toEqual([]);
  });
});

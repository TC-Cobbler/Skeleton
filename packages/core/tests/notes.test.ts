import { describe, expect, it } from "vitest";
import { applyNoteOp, NotesError, orphanedNotes, readNotes, writeNotes, type NotesFile } from "../src/index.js";

const now = "2026-09-30T12:00:00.000Z";
const seq = () => {
  let i = 0;
  return () => ((i++ * 7) % 36) / 36;
};

describe("notes.json (T5.1)", () => {
  it("reads the scaffold's empty file", () => {
    expect(readNotes('{ "notes": [] }')).toEqual({ notes: [], replies: [] });
  });

  it("round-trips through write and read", () => {
    let file: NotesFile = { notes: [], replies: [] };
    file = applyNoteOp(file, { op: "add", target: "ui_tbl01", type: "build", text: "Load orders\n from /api/orders" }, { now, random: seq() }).file;
    file = { ...file, replies: [{ target: "ui_tbl01", text: "Done via useOrders()", pass: 1 }] };
    expect(readNotes(writeNotes(file))).toEqual(file);
    expect(file.notes[0]).toMatchObject({ target: "ui_tbl01", type: "build", text: "Load orders from /api/orders", status: "open", handoff: null, created: now });
    expect(file.notes[0]?.id).toMatch(/^n_[a-z0-9]{6}$/);
  });

  it("refuses malformed files with a reason", () => {
    expect(() => readNotes("nope")).toThrow(NotesError);
    expect(() => readNotes('{ "notes": [{ "id": "x" }] }')).toThrow(/id must look like/);
    const note = { id: "n_aaaaaa", target: "ui_tbl01", type: "build", text: "t", status: "open", created: now, handoff: null };
    expect(() => readNotes(JSON.stringify({ notes: [note, note] }))).toThrow(/appears twice/);
    expect(() => readNotes(JSON.stringify({ notes: [{ ...note, target: "tbl" }] }))).toThrow(/target/);
    expect(() => readNotes(JSON.stringify({ notes: [], replies: [{ target: null, text: "x", pass: 0 }] }))).toThrow(/pass/);
  });

  it("updates, re-attaches and deletes", () => {
    const added = applyNoteOp({ notes: [], replies: [] }, { op: "add", target: "ui_tbl01", type: "question", text: "Empty state?" }, { now });
    const updated = applyNoteOp(added.file, { op: "update", id: added.id, status: "resolved", target: "ui_crd01", type: "behaviour" }, { now }).file;
    expect(updated.notes[0]).toMatchObject({ target: "ui_crd01", status: "resolved", type: "behaviour", text: "Empty state?" });
    expect(applyNoteOp(updated, { op: "delete", id: added.id }, { now }).file.notes).toEqual([]);
    expect(() => applyNoteOp(updated, { op: "delete", id: "n_zzzzzz" }, { now })).toThrow(/no note/);
    expect(() => applyNoteOp(updated, { op: "add", target: "ui_crd01", type: "build", text: "  " }, { now })).toThrow(/text/);
    expect(() => applyNoteOp(updated, { op: "add", target: "card", type: "build", text: "x" }, { now })).toThrow(/data-ui-id/);
  });

  it("derives orphans from the project's IDs", () => {
    let file: NotesFile = { notes: [], replies: [] };
    file = applyNoteOp(file, { op: "add", target: "ui_tbl01", type: "build", text: "a" }, { now }).file;
    file = applyNoteOp(file, { op: "add", target: "ui_gone1", type: "build", text: "b" }, { now }).file;
    expect(orphanedNotes(file, new Set(["ui_tbl01"])).map((n) => n.target)).toEqual(["ui_gone1"]);
  });
});

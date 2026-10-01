// Intent notes (T5.1, PRD §12.1): what `skeleton/notes.json` holds, and pure ops on it.
// Notes are keyed by data-ui-id. Whether a note is orphaned (its element is gone) is
// derived from the project's IDs, never stored (ADR 011).

import { isUiId, type Random } from "./ids.js";
import type { Reason } from "./reasons.js";

export type NoteType = "build" | "behaviour" | "question";
export type NoteStatus = "open" | "resolved";

export const NOTE_TYPES: readonly NoteType[] = ["build", "behaviour", "question"];
export const NOTE_ID_PATTERN = /^n_[a-z0-9]{6}$/;
/** Longest note or reply text. */
export const NOTE_TEXT_MAX = 2000;

export interface Note {
  /** `n_` + 6 lowercase alphanumerics, unique within the file. */
  id: string;
  /** The element's data-ui-id. */
  target: string;
  type: NoteType;
  /** One line. */
  text: string;
  status: NoteStatus;
  /** ISO time the note was made. */
  created: string;
  /** The handoff it was last sent to the agent in, or null if never. */
  handoff: number | null;
}

/** An agent reply from HANDOFF.md, pinned to the element it names (null: about nothing in particular). */
export interface Reply {
  target: string | null;
  text: string;
  /** The pass it came back in. */
  pass: number;
}

export interface NotesFile {
  notes: Note[];
  replies: Reply[];
}

export class NotesError extends Error {
  readonly reason: Reason | null;

  constructor(message: string, options?: { reason?: Reason }) {
    super(message);
    this.name = "NotesError";
    this.reason = options?.reason ?? null;
  }
}

/** Read `notes.json`. A file with only `{ "notes": [] }` (the scaffold's) is fine. */
export function readNotes(text: string): NotesFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new NotesError(`notes.json isn't JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new NotesError("notes.json must hold an object");
  const { notes = [], replies = [] } = raw as Record<string, unknown>;
  if (!Array.isArray(notes)) throw new NotesError("notes.json: notes must be a list");
  if (!Array.isArray(replies)) throw new NotesError("notes.json: replies must be a list");
  const seen = new Set<string>();
  const out: NotesFile = {
    notes: notes.map((n, i) => {
      const note = noteOf(n, i);
      if (seen.has(note.id)) throw new NotesError(`notes.json: note ${note.id} appears twice`);
      seen.add(note.id);
      return note;
    }),
    replies: replies.map(replyOf),
  };
  return out;
}

export function writeNotes(file: NotesFile): string {
  return `${JSON.stringify({ notes: file.notes, replies: file.replies }, null, 2)}\n`;
}

function noteOf(raw: unknown, index: number): Note {
  const where = `notes.json: note ${index + 1}`;
  if (typeof raw !== "object" || raw === null) throw new NotesError(`${where} must be an object`);
  const n = raw as Record<string, unknown>;
  if (typeof n["id"] !== "string" || !NOTE_ID_PATTERN.test(n["id"])) throw new NotesError(`${where}: id must look like n_abc123`);
  if (typeof n["target"] !== "string" || !isUiId(n["target"])) throw new NotesError(`${where}: target must be a data-ui-id`);
  if (!NOTE_TYPES.includes(n["type"] as NoteType)) throw new NotesError(`${where}: type must be build, behaviour or question`);
  if (typeof n["text"] !== "string") throw new NotesError(`${where}: text must be a string`);
  if (n["status"] !== "open" && n["status"] !== "resolved") throw new NotesError(`${where}: status must be open or resolved`);
  if (typeof n["created"] !== "string") throw new NotesError(`${where}: created must be a time`);
  const handoff = n["handoff"] ?? null;
  if (handoff !== null && !(Number.isInteger(handoff) && (handoff as number) > 0)) throw new NotesError(`${where}: handoff must be a handoff number or null`);
  return {
    id: n["id"],
    target: n["target"],
    type: n["type"] as NoteType,
    text: n["text"],
    status: n["status"],
    created: n["created"],
    handoff: handoff as number | null,
  };
}

function replyOf(raw: unknown, index: number): Reply {
  const where = `notes.json: reply ${index + 1}`;
  if (typeof raw !== "object" || raw === null) throw new NotesError(`${where} must be an object`);
  const r = raw as Record<string, unknown>;
  const target = r["target"] ?? null;
  if (target !== null && (typeof target !== "string" || !isUiId(target))) throw new NotesError(`${where}: target must be a data-ui-id or null`);
  if (typeof r["text"] !== "string") throw new NotesError(`${where}: text must be a string`);
  if (!Number.isInteger(r["pass"]) || (r["pass"] as number) < 1) throw new NotesError(`${where}: pass must be a pass number`);
  return { target: target as string | null, text: r["text"], pass: r["pass"] as number };
}

/** A change the user makes to the notes. */
export type NoteOp =
  | { op: "add"; target: string; type: NoteType; text: string }
  /** Change any of a note's fields; `target` re-attaches it (the orphan tray, T5.5). */
  | { op: "update"; id: string; type?: NoteType; text?: string; status?: NoteStatus; target?: string }
  | { op: "delete"; id: string };

export interface NoteOpContext {
  /** ISO time for new notes. */
  now: string;
  random?: Random;
}

/** Apply one op. Refuses (NotesError) a bad target, empty text or an unknown note. */
export function applyNoteOp(file: NotesFile, op: NoteOp, ctx: NoteOpContext): { file: NotesFile; id: string } {
  const text = (value: string) => {
    const line = value.replace(/\s+/g, " ").trim();
    if (line === "") throw new NotesError("a note needs some text");
    if (line.length > NOTE_TEXT_MAX) throw new NotesError(`a note can be at most ${NOTE_TEXT_MAX} characters`);
    return line;
  };
  const target = (value: string) => {
    if (!isUiId(value)) throw new NotesError(`${value} isn't a data-ui-id`);
    return value;
  };
  const find = (id: string) => {
    const note = file.notes.find((n) => n.id === id);
    if (!note) throw new NotesError(`no note ${id}`);
    return note;
  };
  switch (op.op) {
    case "add": {
      const id = mintNoteId(new Set(file.notes.map((n) => n.id)), ctx.random);
      const note: Note = { id, target: target(op.target), type: op.type, text: text(op.text), status: "open", created: ctx.now, handoff: null };
      return { file: { ...file, notes: [...file.notes, note] }, id };
    }
    case "update": {
      const old = find(op.id);
      const next: Note = {
        ...old,
        ...(op.type !== undefined ? { type: op.type } : {}),
        ...(op.text !== undefined ? { text: text(op.text) } : {}),
        ...(op.status !== undefined ? { status: op.status } : {}),
        ...(op.target !== undefined ? { target: target(op.target) } : {}),
      };
      return { file: { ...file, notes: file.notes.map((n) => (n === old ? next : n)) }, id: op.id };
    }
    case "delete":
      find(op.id);
      return { file: { ...file, notes: file.notes.filter((n) => n.id !== op.id) }, id: op.id };
  }
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function mintNoteId(taken: Set<string>, random: Random = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = "n_";
    for (let i = 0; i < 6; i++) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (!taken.has(id)) return id;
  }
  throw new NotesError("could not mint an unused note id after 1000 attempts");
}

/** Notes whose element is no longer in the project (T5.5). */
export function orphanedNotes(file: NotesFile, projectIds: ReadonlySet<string>): Note[] {
  return file.notes.filter((n) => !projectIds.has(n.target));
}

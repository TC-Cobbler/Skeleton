// Intent notes in the UI (T5.1): which notes the panel shows, and the pins drawn on
// the canvas. Pure, so it's tested without a browser.

import type { NoteType, NoteView, NotesView, Reply } from "@skeleton/app-main/ipc";
import type { NotePin } from "@skeleton/overlay/protocol";
import type { KeyedNode } from "./canvas/nodes.js";

export const TYPE_LABEL: Record<NoteType, string> = { build: "Build", behaviour: "Behaviour", question: "Question" };

export interface NoteFilter {
  type: NoteType | "all";
  status: "open" | "resolved" | "all";
  /** Only notes on this element (a pin was clicked), or null. */
  target: string | null;
}

/** Notes the list shows: pinned (not orphaned) ones matching the filter, open first. */
export function filterNotes(notes: NoteView[], filter: NoteFilter): NoteView[] {
  return notes
    .filter((n) => !n.orphaned)
    .filter((n) => filter.type === "all" || n.type === filter.type)
    .filter((n) => filter.status === "all" || n.status === filter.status)
    .filter((n) => filter.target === null || n.target === filter.target)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));
}

/** Replies about an element, newest pass first. */
export function repliesFor(replies: Reply[], target: string | null): Reply[] {
  return replies.filter((r) => r.target === target).sort((a, b) => b.pass - a.pass);
}

/** Replies about elements with no notes on them, or about nothing in particular. */
export function looseReplies(view: NotesView): Reply[] {
  const noted = new Set(view.notes.map((n) => n.target));
  return view.replies.filter((r) => r.target === null || !noted.has(r.target)).sort((a, b) => b.pass - a.pass);
}

/** One pin per element on the page with notes or replies (PRD §12.1, §12.3). */
export function pinsFor(view: NotesView | null, nodes: KeyedNode[]): NotePin[] {
  if (!view) return [];
  const keyOf = new Map<string, string>();
  for (const n of nodes) if (n.node.id && !keyOf.has(n.node.id)) keyOf.set(n.node.id, n.key);
  const pins = new Map<string, NotePin>();
  const pinOf = (target: string, type: NoteType): NotePin | null => {
    const key = keyOf.get(target);
    if (!key) return null;
    let pin = pins.get(key);
    if (!pin) {
      pin = { key, open: 0, total: 0, type, replied: false };
      pins.set(key, pin);
    }
    return pin;
  };
  for (const note of view.notes) {
    if (note.orphaned) continue;
    const pin = pinOf(note.target, note.type);
    if (!pin) continue;
    // The colour follows the first open note.
    if (note.status === "open" && pin.open === 0) pin.type = note.type;
    pin.total++;
    if (note.status === "open") pin.open++;
  }
  for (const reply of view.replies) {
    if (!reply.target) continue;
    const pin = pinOf(reply.target, "build");
    if (pin) pin.replied = true;
  }
  return [...pins.values()];
}

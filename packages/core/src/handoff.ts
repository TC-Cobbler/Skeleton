// HANDOFF.md (PRD §12.2): compiling it at hand off (T5.2), and reading the agent's
// ticks and replies back at take back (T5.3). Plus what changed since the last
// handoff, and which contract rules a pass broke (T5.4). Pure; main does the I/O.

import type { Snapshot, TakeBackReport } from "./analyse.js";
import { buildIdIndex, type IdOccurrence } from "./ids.js";
import type { Note, NoteType, NotesFile, Reply } from "./notes.js";
import { readRoutes } from "./routes.js";
import { readTokens, type TokenBlock } from "./tokens.js";

export const HANDOFF_FILE = "HANDOFF.md";

const TYPE_LABEL: Record<NoteType, string> = { build: "Build", behaviour: "Behaviour", question: "Question" };
const UI_ID = /ui_[a-z0-9]{5}/;

export interface ElementRef {
  id: string;
  /** Element name, e.g. "Table". */
  element: string;
  file: string;
  line: number;
}

export interface TokenEdit {
  name: string;
  block: TokenBlock;
  before: string | null;
  after: string | null;
}

/** What Skeleton changed since the last loop commit (ADR 011). */
export interface HandoffChanges {
  pagesAdded: string[];
  pagesRemoved: string[];
  tokens: TokenEdit[];
  elementsAdded: ElementRef[];
  elementsRemoved: ElementRef[];
  /** Files that couldn't be read after, so their changes aren't listed (the build check says why). */
  unreadable: { file: string; message: string }[];
}

export interface ChangesConfig {
  routerFile: string;
  tokenFile: string;
}

const DEFAULT_CHANGES_CONFIG: ChangesConfig = { routerFile: "src/router.tsx", tokenFile: "src/styles/globals.css" };

/** Project source files (for IDs): .tsx/.jsx under src/. */
const isJsx = (path: string) => path.startsWith("src/") && /\.(tsx|jsx)$/.test(path);

/**
 * Compare two snapshots. Files that don't parse are left out of the ID comparison
 * rather than failing it (the build check reports them).
 */
export function changesSince(before: Snapshot, after: Snapshot, config: ChangesConfig = DEFAULT_CHANGES_CONFIG): HandoffChanges {
  const unreadable: HandoffChanges["unreadable"] = [];
  // Only failures after are reported: before was a committed, building state.
  const attempt = <T>(file: string, record: boolean, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      if (record) unreadable.push({ file, message: e instanceof Error ? e.message : String(e) });
      return fallback;
    }
  };
  const pagesOf = (snap: Snapshot, record: boolean): string[] => {
    const source = snap[config.routerFile];
    if (source === undefined) return [];
    return attempt(config.routerFile, record, () => readRoutes(source, config.routerFile).routes.map((r) => r.path), []);
  };
  const beforePages = pagesOf(before, false);
  const afterPages = pagesOf(after, true);
  const idsOf = (snap: Snapshot, record: boolean) => {
    const files: Snapshot = {};
    for (const [path, source] of Object.entries(snap)) {
      if (isJsx(path) && attempt(path, record, () => (buildIdIndex({ [path]: source }), true), false)) files[path] = source;
    }
    return buildIdIndex(files).ids;
  };
  const b = idsOf(before, false);
  const a = idsOf(after, true);
  const ref = (id: string, occ: IdOccurrence): ElementRef => ({ id, element: occ.element, file: occ.file, line: occ.line });
  return {
    pagesAdded: afterPages.filter((p) => !beforePages.includes(p)),
    pagesRemoved: beforePages.filter((p) => !afterPages.includes(p)),
    tokens: tokenEdits(before[config.tokenFile], after[config.tokenFile]),
    elementsAdded: [...a].filter(([id]) => !b.has(id)).map(([id, occ]) => ref(id, occ[0] as IdOccurrence)),
    elementsRemoved: [...b].filter(([id]) => !a.has(id)).map(([id, occ]) => ref(id, occ[0] as IdOccurrence)),
    unreadable,
  };
}

function tokenEdits(before: string | undefined, after: string | undefined): TokenEdit[] {
  if (before === after || before === undefined || after === undefined) return [];
  const key = (name: string, block: TokenBlock) => `${block}\0${name}`;
  const b = new Map(readTokens(before).map((t) => [key(t.name, t.block), t]));
  const a = new Map(readTokens(after).map((t) => [key(t.name, t.block), t]));
  const out: TokenEdit[] = [];
  for (const [k, t] of b) {
    const next = a.get(k);
    if (!next || next.value !== t.value) out.push({ name: t.name, block: t.block, before: t.value, after: next?.value ?? null });
  }
  for (const [k, t] of a) if (!b.has(k)) out.push({ name: t.name, block: t.block, before: null, after: t.value });
  return out;
}

export interface HandoffInput {
  number: number;
  /** As shown in the heading, e.g. "2026-09-28 23:50". */
  date: string;
  changes: HandoffChanges;
  /** The open notes to hand over, in order. */
  tasks: Note[];
}

/** HANDOFF.md, in the PRD §12.2 format. */
export function compileHandoff(input: HandoffInput): string {
  const { changes: c } = input;
  const lines = [`# Handoff #${input.number} — ${input.date}`, "", "## Changes since last handoff"];
  const changes: string[] = [];
  if (c.pagesAdded.length) changes.push(`- Added pages: ${c.pagesAdded.join(", ")}`);
  if (c.pagesRemoved.length) changes.push(`- Removed pages: ${c.pagesRemoved.join(", ")}`);
  if (c.tokens.length) {
    const edit = (t: TokenEdit) => `${t.name}${t.block === "dark" ? " (dark)" : ""} ${t.before ?? "(new)"} → ${t.after ?? "(removed)"}`;
    changes.push(`- Token changes: ${c.tokens.map(edit).join("; ")}`);
  }
  const element = (e: ElementRef) => `${e.id} (${e.element} in ${fileLabel(e.file)})`;
  if (c.elementsAdded.length) changes.push(`- New elements: ${c.elementsAdded.map(element).join(", ")}`);
  if (c.elementsRemoved.length) changes.push(`- Removed elements: ${c.elementsRemoved.map(element).join(", ")}`);
  lines.push(...(changes.length ? changes : ["- No changes."]), "", "## Tasks");
  if (input.tasks.length === 0) lines.push("- No tasks this time.");
  for (const n of input.tasks) lines.push(`- [ ] ${n.target} · ${TYPE_LABEL[n.type]} · ${oneLine(n.text)}`);
  lines.push("", "## Agent replies", "<!-- Agent: tick tasks above and add replies here, keyed by data-ui-id -->", "");
  return lines.join("\n");
}

/** "src/pages/OrdersPage.tsx" → "OrdersPage". */
function fileLabel(file: string): string {
  return (file.split("/").pop() ?? file).replace(/\.(tsx|jsx|ts|js)$/, "");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface HandoffTask {
  done: boolean;
  /** The element the task names, or null if the line names none. */
  target: string | null;
  type: NoteType | null;
  text: string;
}

export interface ParsedHandoff {
  /** From `# Handoff #N`, or null. */
  number: number | null;
  tasks: HandoffTask[];
  replies: Omit<Reply, "pass">[];
}

/**
 * Read the agent's HANDOFF.md: ticked tasks, and replies under "Agent replies"
 * (`- ui_x · text`; a reply naming no ID is kept with no target). Tolerant of the
 * small liberties agents take (`*` bullets, `X`, backticks, `:` or `—` separators).
 */
export function parseHandoff(markdown: string): ParsedHandoff {
  const numberMatch = /^#\s+Handoff\s+#(\d+)/m.exec(markdown);
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const tasks: HandoffTask[] = [];
  const replies: Omit<Reply, "pass">[] = [];
  let section: "tasks" | "replies" | "other" = "other";
  let current: Omit<Reply, "pass">[] | null = null;
  for (const raw of withoutComments.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      const title = (heading[1] as string).toLowerCase();
      section = /^tasks\b/.test(title) ? "tasks" : /replies/.test(title) ? "replies" : "other";
      current = null;
      continue;
    }
    if (section === "tasks") {
      const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(raw);
      if (m) tasks.push(taskOf(m[1] !== " ", m[2] as string));
      continue;
    }
    if (section !== "replies") continue;
    const item = /^[-*+]\s+(.*)$/.exec(raw.trimEnd());
    if (item) {
      current = repliesOf(item[1] as string);
      replies.push(...current);
    } else if (raw.trim() === "") {
      current = null;
    } else if (current && /^\s+/.test(raw)) {
      // An indented continuation of the item above.
      for (const r of current) r.text = `${r.text} ${raw.trim()}`;
    } else {
      current = [{ target: null, text: raw.trim() }];
      replies.push(...current);
    }
  }
  return { number: numberMatch ? Number(numberMatch[1]) : null, tasks, replies };
}

function taskOf(done: boolean, rest: string): HandoffTask {
  const parts = rest.split(/\s+[·|]\s+/);
  const idPart = parts[0]?.replace(/[`*]/g, "").trim() ?? "";
  const id = /^ui_[a-z0-9]{5}$/.test(idPart) ? idPart : null;
  const typeWord = (parts[1] ?? "").replace(/[`*]/g, "").trim().toLowerCase();
  const type: NoteType | null = typeWord === "build" ? "build" : /^behaviou?r$/.test(typeWord) ? "behaviour" : typeWord === "question" ? "question" : null;
  const text = id && type ? parts.slice(2).join(" · ") : id ? parts.slice(1).join(" · ") : rest;
  return { done, target: id, type, text: oneLine(text) };
}

/** One reply per ID the item starts with (`ui_a, ui_b · text`), or one with no target. */
function repliesOf(item: string): Omit<Reply, "pass">[] {
  const m = /^((?:[`*]*ui_[a-z0-9]{5}[`*]*\s*[,&]?\s*)+)\s*(?:[·:—–|-]\s*)?(.*)$/.exec(item);
  if (!m) return [{ target: null, text: oneLine(item) }];
  const ids = [...(m[1] as string).matchAll(new RegExp(UI_ID, "g"))].map((x) => x[0]);
  const text = oneLine(m[2] as string);
  return ids.map((target) => ({ target, text }));
}

export interface NotesTakeBack {
  file: NotesFile;
  /** Notes resolved by a ticked task. */
  resolved: string[];
  /** Ticked tasks no note was found for. */
  unmatched: HandoffTask[];
  /** Replies added. */
  replies: number;
}

/**
 * Fold the agent's HANDOFF.md into the notes (T5.3): each ticked task resolves the
 * note sent in handoff `pass` it matches, first by ID, type and text, then by its
 * position among the tasks for that ID. Replies are added as they are.
 */
export function takeBackNotes(file: NotesFile, parsed: ParsedHandoff, pass: number): NotesTakeBack {
  const sent = file.notes.filter((n) => n.handoff === pass);
  const used = new Set<string>();
  const resolved: string[] = [];
  const unmatched: HandoffTask[] = [];
  const seenPerTarget = new Map<string, number>();
  for (const task of parsed.tasks) {
    const position = task.target ? (seenPerTarget.get(task.target) ?? 0) : 0;
    if (task.target) seenPerTarget.set(task.target, position + 1);
    if (!task.done) continue;
    const forTarget = sent.filter((n) => n.target === task.target);
    const note =
      forTarget.find((n) => !used.has(n.id) && n.type === task.type && oneLine(n.text) === task.text) ??
      (forTarget[position] && !used.has((forTarget[position] as Note).id) ? forTarget[position] : undefined);
    if (!note) {
      unmatched.push(task);
      continue;
    }
    used.add(note.id);
    if (note.status === "open") resolved.push(note.id);
  }
  const replies: Reply[] = parsed.replies.filter((r) => r.text !== "").map((r) => ({ ...r, pass }));
  return {
    file: {
      notes: file.notes.map((n) => (resolved.includes(n.id) ? { ...n, status: "resolved" as const } : n)),
      replies: [...file.replies, ...replies],
    },
    resolved,
    unmatched,
    replies: replies.length,
  };
}

export interface ContractBreach {
  /** The round-trip contract rule (PRD §13). */
  rule: number;
  text: string;
  file: string | null;
  line: number | null;
}

export interface BreachContext {
  /** Project-relative files the pass changed, with how. */
  files: { path: string; status: "added" | "modified" | "deleted" }[];
  /** There were tasks, and HANDOFF.md came back without a tick or a reply. */
  unreported: boolean;
  routerFile?: string;
  tokenFile?: string;
}

/** The contract rules a pass broke (T5.4), from the analyser's report and the pass's files. */
export function contractBreaches(report: TakeBackReport, ctx: BreachContext): ContractBreach[] {
  const out: ContractBreach[] = [];
  const at = (rule: number, text: string, file: string | null = null, line: number | null = null) => out.push({ rule, text, file, line });
  for (const o of report.orphanedIds) at(1, `${o.id} (${o.lastSeen.element}) was removed or changed`, o.lastSeen.file, o.lastSeen.line);
  for (const d of report.duplicateIds) {
    if (!d.isNew) continue;
    const first = d.occurrences[0];
    at(1, `${d.id} is used ${d.occurrences.length} times`, first?.file ?? null, first?.line ?? null);
  }
  for (const n of report.unIdedEditable) at(1, `<${n.element}> has no data-ui-id`, n.file, n.line);
  for (const n of report.unIdedLocked) at(1, `<${n.element}> has no data-ui-id`, n.file, n.line);
  for (const v of report.newViolations) at(2, `${v.kind === "inline-style" ? "inline style" : v.value}`, v.file, v.line);
  const tt = report.tokenTampering;
  if (tt) {
    for (const c of tt.changes) at(3, `${c.name}${c.block === "dark" ? " (dark)" : ""}: ${c.before ?? "(none)"} → ${c.after ?? "(removed)"}`, ctx.tokenFile ?? "src/styles/globals.css");
    if (tt.nonTokenChanges) at(3, "the token file was changed outside its tokens", ctx.tokenFile ?? "src/styles/globals.css");
  }
  const scaffold = [ctx.routerFile ?? "src/router.tsx", ctx.tokenFile ?? "src/styles/globals.css"];
  for (const f of ctx.files) {
    if (f.path.startsWith("skeleton/")) at(6, `${f.path} was ${f.status} (Skeleton's own folder)`, f.path);
    else if (f.status === "deleted" && scaffold.includes(f.path)) at(6, `${f.path} was deleted`, f.path);
  }
  if (ctx.unreported) at(7, "HANDOFF.md came back with no ticks and no replies", HANDOFF_FILE);
  return out;
}

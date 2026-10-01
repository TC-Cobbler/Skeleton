// The handoff loop (Phase 5, ADR 011): intent notes, Hand off, Take back and Revert
// pass. Where the loop stands is read from git history, never stored. Every write
// goes through the editor's per-project queue, so it never interleaves with an edit.

import { execFile } from "node:child_process";
import path from "node:path";
import {
  analyseTakeBack,
  applyNoteOp,
  buildIdIndex,
  changesSince,
  compileHandoff,
  contractBreaches,
  HANDOFF_FILE,
  NotesError,
  parseHandoff,
  readNotes,
  reason,
  reasonOf,
  repairIds,
  takeBackNotes,
  writeNotes,
  type IdIndex,
  type NoteOp,
  type NotesFile,
  type Random,
  type Reason,
  type Snapshot,
} from "@skeleton/core";
import { GLOBALS_CSS } from "@skeleton/templates";
import type { GitService } from "../git/service.js";
import type { BuildResult, LoopStatus, NotesView, PassSummary } from "../ipc/contract.js";
import type { Editor } from "./editor.js";

export const NOTES_FILE = "skeleton/notes.json";

/** The loop's own commit subjects (ADR 011). */
const HANDOFF_SUBJECT = /^skeleton: handoff #(\d+)$/;
const PASS_SUBJECT = /^agent: pass #(\d+)$/;
const REVERT_SUBJECT = /^skeleton: revert pass #(\d+)$/;
/** How far back the history is read for loop commits. */
const LOG_DEPTH = 1000;
/** What a take-back compares: the project's code, Skeleton's folder, and the handoff. */
const LOOP_PATHS = ["src", "skeleton", HANDOFF_FILE];

/** A loop action that can't happen now (with the agent already, duplicate IDs, …). Nothing was written. */
export class LoopRefused extends Error {
  readonly reason: Reason | null;

  constructor(message: string, options?: { cause?: unknown; reason?: Reason }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LoopRefused";
    this.reason = options?.reason ?? reasonOf(options?.cause);
  }
}

export interface LoopIO {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  /** Project-relative .tsx/.jsx files under src/. */
  listSources(projectRoot: string): Promise<string[]>;
}

export interface LoopDeps {
  io: LoopIO;
  git: Pick<GitService, "log" | "commit" | "status" | "diff" | "revert" | "snapshot" | "rootCommit">;
  editor: Pick<Editor, "exclusive" | "clearHistory">;
  /** Runs the project's build (`pnpm run build`). */
  build: (projectRoot: string) => Promise<BuildResult>;
  /** Stop or restart reacting to file changes (the watcher, PRD §7.5). */
  setLocked: (projectRoot: string, locked: boolean) => void;
  now?: () => Date;
  random?: Random;
}

/** Where the loop stands, from git (everything in LoopStatus but the session's summary). */
interface Derived extends Omit<LoopStatus, "summary"> {
  /** What "changes since last handoff" is measured from: the newest pass or revert, or null for the first commit. */
  baseline: string | null;
}

export class Loop {
  private readonly derived = new Map<string, Promise<Derived>>();
  /** Pass summaries from take-backs this session (T5.4). */
  private readonly summaries = new Map<string, PassSummary>();

  constructor(private readonly deps: LoopDeps) {}

  async status(projectRoot: string): Promise<LoopStatus> {
    const d = await this.derive(projectRoot);
    const summary = this.summaries.get(projectRoot);
    return { state: d.state, handoff: d.handoff, pass: d.pass, next: d.next, summary: summary && d.pass?.commit === summary.passCommit ? summary : null };
  }

  /** Why the project can't be edited now, or null (the editor's lock, ADR 011). */
  async lockReason(projectRoot: string): Promise<string | null> {
    let d: Derived;
    try {
      d = await this.derive(projectRoot);
    } catch (error) {
      // No readable history (not a git repo yet): there's no loop to be locked by.
      console.error(`[loop] ${projectRoot}: can't read the loop state; edits stay open`, error);
      return null;
    }
    return d.state === "with-agent" ? `The project is with the agent (handoff #${d.handoff?.number ?? "?"}). Take it back first.` : null;
  }

  // Notes (T5.1, T5.5) -------------------------------------------------------

  async notes(projectRoot: string): Promise<NotesView> {
    const file = await this.readNotesFile(projectRoot);
    const index = await this.projectIds(projectRoot);
    return {
      notes: file.notes.map((n) => {
        const at = index.ids.get(n.target)?.[0];
        return { ...n, orphaned: !at, element: at?.element ?? null, file: at?.file ?? null };
      }),
      replies: file.replies,
    };
  }

  writeNote(projectRoot: string, op: NoteOp): Promise<NotesView> {
    return this.deps.editor.exclusive(projectRoot, async () => {
      const locked = await this.lockReason(projectRoot);
      if (locked) throw new LoopRefused(locked, { reason: reason("with-agent") });
      const file = await this.readNotesFile(projectRoot);
      const target = op.op === "add" ? op.target : op.op === "update" ? op.target : undefined;
      if (target !== undefined && !(await this.projectIds(projectRoot)).ids.has(target)) {
        throw new LoopRefused(`${target} isn't on any element in the project`, { reason: reason("note-element-gone", { id: target }) });
      }
      let next: NotesFile;
      try {
        next = applyNoteOp(file, op, { now: this.now().toISOString(), ...(this.deps.random ? { random: this.deps.random } : {}) }).file;
      } catch (cause) {
        if (cause instanceof NotesError) throw new LoopRefused(cause.message, { cause });
        throw cause;
      }
      await this.write(projectRoot, NOTES_FILE, writeNotes(next));
      return this.notes(projectRoot);
    });
  }

  // Hand off (T5.2) ----------------------------------------------------------

  handoff(projectRoot: string): Promise<LoopStatus> {
    return this.deps.editor.exclusive(projectRoot, async () => {
      const d = await this.refresh(projectRoot);
      if (d.state === "with-agent") {
        throw new LoopRefused(`The project is already with the agent (handoff #${d.handoff?.number ?? "?"}).`, { reason: reason("already-handed-off", { round: d.handoff?.number ?? 0 }) });
      }
      const number = d.next;
      const work = await this.workingTree(projectRoot);
      const index = this.indexOf(work);
      if (index.duplicates.length > 0) {
        const where = index.duplicates.slice(0, 5).map((id) => `${id} (${(index.ids.get(id) ?? []).map((o) => `${o.file}:${o.line}`).join(", ")})`);
        throw new LoopRefused(`Duplicate IDs: ${where.join("; ")}. Each element needs its own data-ui-id before handing off.`, { reason: reason("duplicate-ids", { where: where.join("; ") }) });
      }
      const build = await this.deps.build(projectRoot);
      if (!build.ok) throw new LoopRefused(`The project doesn't build, so it can't be handed off:\n${build.output}`, { reason: reason("build-broken") });

      const baseline = d.baseline ?? (await this.deps.git.rootCommit(projectRoot));
      const changes = changesSince(await this.deps.git.snapshot(projectRoot, baseline, ["src"]), work);
      const notes = await this.readNotesFile(projectRoot);
      const tasks = notes.notes.filter((n) => n.status === "open" && index.ids.has(n.target));
      const sent = new Set(tasks.map((n) => n.id));
      const nextNotes: NotesFile = { ...notes, notes: notes.notes.map((n) => (sent.has(n.id) ? { ...n, handoff: number } : n)) };
      await this.write(projectRoot, NOTES_FILE, writeNotes(nextNotes));
      await this.write(projectRoot, HANDOFF_FILE, compileHandoff({ number, date: stamp(this.now()), changes, tasks: tasks.map((n) => ({ ...n, handoff: number })) }));
      await this.deps.git.commit(projectRoot, `skeleton: handoff #${number}`, { allowEmpty: true });
      this.deps.editor.clearHistory(projectRoot);
      this.summaries.delete(projectRoot);
      await this.refresh(projectRoot);
      return this.status(projectRoot);
    });
  }

  // Take back (T5.3, T5.4, T5.6) ---------------------------------------------

  takeBack(projectRoot: string): Promise<LoopStatus> {
    return this.deps.editor.exclusive(projectRoot, async () => {
      const d = await this.refresh(projectRoot);
      if (d.state !== "with-agent" || !d.handoff) throw new LoopRefused("The project isn't with the agent: there's nothing to take back.", { reason: reason("not-handed-off") });
      const number = d.handoff.number;
      const handoffCommit = d.handoff.commit;
      const made = await this.deps.git.commit(projectRoot, `agent: pass #${number}`, { allowEmpty: true });
      if (!made) throw new Error(`the agent: pass #${number} commit wasn't made`);
      const passCommit = made.hash;
      const git = this.deps.git;
      const before = await git.snapshot(projectRoot, handoffCommit, LOOP_PATHS);
      const after = await git.snapshot(projectRoot, passCommit, LOOP_PATHS);
      const report = analyseTakeBack(before, after);
      const diff = await git.diff(projectRoot, handoffCommit, passCommit);

      // Ticks and replies (from the notes as Skeleton handed them over).
      const parsed = parseHandoff(after[HANDOFF_FILE] ?? "");
      const sentTasks = parseHandoff(before[HANDOFF_FILE] ?? "").tasks.length;
      let notes: NotesFile;
      try {
        notes = readNotes(before[NOTES_FILE] ?? '{ "notes": [] }');
      } catch (cause) {
        throw new Error(`the handoff's ${NOTES_FILE} can't be read: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
      }
      const back = takeBackNotes(notes, parsed, number);
      await this.write(projectRoot, NOTES_FILE, writeNotes(back.file));

      // Repairs, on the files that still parse.
      const broken = new Set(report.parseErrors.map((e) => e.file));
      const sources = (snap: Snapshot) => Object.fromEntries(Object.entries(snap).filter(([f]) => f.startsWith("src/") && !broken.has(f)));
      const repaired = repairIds(sources(before), sources(after), this.deps.random ? { random: this.deps.random } : {});
      for (const [file, text] of Object.entries(repaired.files)) await this.write(projectRoot, file, text);

      const changes = changesSince(before, after);
      const breaches = contractBreaches(report, {
        files: diff.files.map((f) => ({ path: f.path, status: f.status })),
        unreported: sentTasks > 0 && !parsed.tasks.some((t) => t.done) && parsed.replies.length === 0,
      });
      const build = await this.deps.build(projectRoot);
      const ids = (await this.projectIds(projectRoot)).ids;
      const summary: PassSummary = {
        pass: number,
        handoffCommit,
        passCommit,
        files: diff.files.map(({ path: p, status, additions, deletions }) => ({ path: p, status, additions, deletions })),
        elementsAdded: changes.elementsAdded,
        elementsRemoved: changes.elementsRemoved,
        orphanedNotes: back.file.notes.filter((n) => !ids.has(n.target)).length,
        newViolations: report.newViolations,
        newLockedBlocks: report.newLockedBlocks,
        breaches,
        repairs: repaired.repairs,
        tasks: { sent: sentTasks, resolved: back.resolved.length, unmatched: back.unmatched },
        replies: back.file.replies.filter((r) => r.pass === number),
        parseErrors: report.parseErrors,
        build,
      };
      this.summaries.set(projectRoot, summary);
      this.deps.editor.clearHistory(projectRoot);
      await this.refresh(projectRoot);
      return this.status(projectRoot);
    });
  }

  // Revert pass (T5.8) -------------------------------------------------------

  revert(projectRoot: string): Promise<LoopStatus> {
    return this.deps.editor.exclusive(projectRoot, async () => {
      const d = await this.refresh(projectRoot);
      if (!d.pass) throw new LoopRefused("There's no pass to revert: the latest step isn't a take-back.", { reason: reason("nothing-to-undo-agent") });
      const { number, handoffCommit } = d.pass;
      const git = this.deps.git;
      // Nothing is lost: work since the take-back is committed first, and the revert is a new commit.
      await git.commit(projectRoot, `skeleton: edits after pass #${number}`);
      const message = `skeleton: revert pass #${number}`;
      if ((await git.diff(projectRoot, handoffCommit, null)).files.length === 0) await git.commit(projectRoot, message, { allowEmpty: true });
      else await git.revert(projectRoot, handoffCommit, message);
      this.deps.editor.clearHistory(projectRoot);
      this.summaries.delete(projectRoot);
      await this.refresh(projectRoot);
      return this.status(projectRoot);
    });
  }

  // --------------------------------------------------------------------------

  private derive(projectRoot: string): Promise<Derived> {
    return this.derived.get(projectRoot) ?? this.refresh(projectRoot);
  }

  /** Re-read the loop state from git, and lock or unlock the watcher to match. */
  private refresh(projectRoot: string): Promise<Derived> {
    const next = this.read(projectRoot).then((d) => {
      this.deps.setLocked(projectRoot, d.state === "with-agent");
      return d;
    });
    this.derived.set(projectRoot, next);
    // A failed read is retried next time, not cached.
    next.catch(() => this.derived.get(projectRoot) === next && this.derived.delete(projectRoot));
    return next;
  }

  private async read(projectRoot: string): Promise<Derived> {
    const log = await this.deps.git.log(projectRoot, LOG_DEPTH);
    const handoffs = new Map<number, (typeof log)[number]>();
    let latest: { kind: "handoff" | "pass" | "revert"; number: number; hash: string; time: number } | null = null;
    for (const c of log) {
      const h = HANDOFF_SUBJECT.exec(c.subject);
      const p = PASS_SUBJECT.exec(c.subject);
      const r = REVERT_SUBJECT.exec(c.subject);
      const m = h ?? p ?? r;
      if (!m) continue;
      const number = Number(m[1]);
      if (h && !handoffs.has(number)) handoffs.set(number, c);
      latest ??= { kind: h ? "handoff" : p ? "pass" : "revert", number, hash: c.hash, time: c.time };
    }
    const newestHandoff = log.find((c) => HANDOFF_SUBJECT.test(c.subject));
    const passHandoff = latest?.kind === "pass" ? handoffs.get(latest.number) : undefined;
    return {
      state: latest?.kind === "handoff" ? "with-agent" : "with-user",
      handoff: newestHandoff ? { number: Number(HANDOFF_SUBJECT.exec(newestHandoff.subject)?.[1]), commit: newestHandoff.hash, time: newestHandoff.time } : null,
      pass: latest?.kind === "pass" && passHandoff ? { number: latest.number, commit: latest.hash, handoffCommit: passHandoff.hash, time: latest.time } : null,
      next: Math.max(0, ...handoffs.keys()) + 1,
      baseline: latest && latest.kind !== "handoff" ? latest.hash : null,
    };
  }

  private async readNotesFile(projectRoot: string): Promise<NotesFile> {
    const text = await this.deps.io.readFile(path.join(projectRoot, NOTES_FILE)).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return '{ "notes": [] }';
      throw err;
    });
    try {
      return readNotes(text);
    } catch (cause) {
      if (cause instanceof NotesError) throw new LoopRefused(`${NOTES_FILE} can't be read: ${cause.message}`, { cause, reason: reason("notes-unreadable") });
      throw cause;
    }
  }

  /** The project's source as it is on disk: page and component files, and the token file. */
  private async workingTree(projectRoot: string): Promise<Snapshot> {
    const out: Snapshot = {};
    for (const rel of [...(await this.deps.io.listSources(projectRoot)), GLOBALS_CSS]) {
      out[rel] = await this.deps.io.readFile(path.join(projectRoot, rel));
    }
    return out;
  }

  private indexOf(snap: Snapshot): IdIndex {
    const files = Object.fromEntries(Object.entries(snap).filter(([f]) => /\.(tsx|jsx)$/.test(f)));
    try {
      return buildIdIndex(files);
    } catch (cause) {
      throw new LoopRefused(`A source file doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause, reason: reason("file-unreadable") });
    }
  }

  private async projectIds(projectRoot: string): Promise<IdIndex> {
    return this.indexOf(await this.workingTree(projectRoot));
  }

  private write(projectRoot: string, rel: string, content: string): Promise<void> {
    return this.deps.io.writeFile(path.join(projectRoot, rel), content);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

/** "2026-09-28 23:50", local time. */
function stamp(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Output lines kept from a failed build. */
const BUILD_TAIL = 30;

/** Runs the project's own `build` script (`tsc -b && vite build` in the scaffold). */
export function pnpmBuild(pnpm: string = process.env["SKELETON_PNPM"] ?? "pnpm"): (projectRoot: string) => Promise<BuildResult> {
  return (projectRoot) =>
    new Promise((resolve) => {
      const start = Date.now();
      execFile(pnpm, ["run", "build"], { cwd: projectRoot, timeout: 300_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: "true" } }, (error, stdout, stderr) => {
        const ms = Date.now() - start;
        if (!error) return resolve({ ok: true, output: "", ms });
        const lines = `${stdout}\n${stderr}\n${error.message}`.split("\n").map((l) => l.trimEnd()).filter(Boolean);
        resolve({ ok: false, output: lines.slice(-BUILD_TAIL).join("\n"), ms });
      });
    });
}

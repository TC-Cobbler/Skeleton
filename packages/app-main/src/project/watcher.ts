// Project file watcher (T2.6): a revision counter per project that moves whenever
// something under src/ changes, so the renderer knows to re-parse. While a project
// is locked (with the agent, Phase 5) changes are ignored; unlocking catches up.

import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import type { ProjectChanges } from "../ipc/contract.js";

const IGNORED = /(^|[/\\])(node_modules|dist|\.git)([/\\]|$)/;

export type WatchFn = (dir: string, onChange: (file: string | null) => void) => FSWatcher;

export const watchRecursive: WatchFn = (dir, onChange) =>
  watch(dir, { recursive: true, persistent: false }, (_event, file) => onChange(file ? file.toString() : null));

interface Watched {
  watcher: FSWatcher | null;
  revision: number;
  locked: boolean;
  /** A change arrived while locked. */
  missed: boolean;
  /** Changed paths (project-relative) in the latest revision. */
  changed: Set<string>;
  pending: Set<string>;
  timer: NodeJS.Timeout | null;
  error: string | null;
}

export class ProjectWatcher {
  private readonly projects = new Map<string, Watched>();

  constructor(
    private readonly watchFn: WatchFn = watchRecursive,
    private readonly debounceMs = 100,
  ) {}

  /** Starts watching `projectRoot` if needed, and returns where it stands. */
  changes(projectRoot: string): ProjectChanges {
    const w = this.ensure(projectRoot);
    return { revision: w.revision, locked: w.locked, changed: [...w.changed], error: w.error };
  }

  setLocked(projectRoot: string, locked: boolean): void {
    const w = this.ensure(projectRoot);
    if (w.locked === locked) return;
    w.locked = locked;
    if (!locked && w.missed) {
      w.missed = false;
      w.revision += 1;
      w.changed = new Set(["*"]);
    }
  }

  stop(projectRoot: string): void {
    const w = this.projects.get(projectRoot);
    if (!w) return;
    w.watcher?.close();
    if (w.timer) clearTimeout(w.timer);
    this.projects.delete(projectRoot);
  }

  stopAll(): void {
    for (const root of [...this.projects.keys()]) this.stop(root);
  }

  private ensure(projectRoot: string): Watched {
    let w = this.projects.get(projectRoot);
    if (w) return w;
    const entry: Watched = {
      watcher: null,
      revision: 0,
      locked: false,
      missed: false,
      changed: new Set(),
      pending: new Set(),
      timer: null,
      error: null,
    };
    w = entry;
    this.projects.set(projectRoot, entry);
    const src = path.join(projectRoot, "src");
    try {
      entry.watcher = this.watchFn(src, (file) => this.onChange(entry, file));
      entry.watcher.on("error", (err) => {
        entry.error = `watching ${src} failed: ${err.message}`;
        console.error(`[watcher] ${entry.error}`);
      });
    } catch (cause) {
      entry.error = `can't watch ${src}: ${cause instanceof Error ? cause.message : String(cause)}`;
      console.error(`[watcher] ${entry.error}`);
    }
    return entry;
  }

  private onChange(w: Watched, file: string | null): void {
    const rel = file ? path.join("src", file).split(path.sep).join("/") : "src";
    if (IGNORED.test(rel)) return;
    if (w.locked) {
      w.missed = true;
      return;
    }
    w.pending.add(rel);
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      w.timer = null;
      if (w.locked) {
        w.missed = true;
        w.pending.clear();
        return;
      }
      w.revision += 1;
      w.changed = new Set(w.pending);
      w.pending.clear();
    }, this.debounceMs);
  }
}

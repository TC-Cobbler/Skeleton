// The post-edit typecheck (T3.7): one worker per project (checker-worker.ts), asked to
// check after every edit. Main compares diagnostics before and after an edit, and rolls
// the edit back if it introduced any.

import { Worker } from "node:worker_threads";

export interface Diagnostic {
  /** Project-relative, "" for global diagnostics. */
  file: string;
  /** 1-based, 0 when there's no position. */
  line: number;
  code: number;
  message: string;
}

export interface CheckRequest {
  id: number;
}

export type CheckResponse = { id: number; ok: true; diagnostics: Diagnostic[] } | { id: number; ok: false; error: string };

export interface Checker {
  /** The project's errors now; rejects when the project can't be checked. */
  check(): Promise<Diagnostic[]>;
  dispose(): void;
}

/** A check that takes longer than this (a cold start on a big project) doesn't hold edits up. */
const TIMEOUT_MS = 60_000;

export class WorkerChecker implements Checker {
  /** The running worker; null after it exited (the next check starts a new one). */
  private worker: Worker | null = null;
  private disposed = false;
  private next = 0;
  private readonly waiting = new Map<number, { resolve: (d: Diagnostic[]) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(
    private readonly projectRoot: string,
    private readonly script: URL = new URL("./checker-worker.js", import.meta.url),
  ) {
    // Warm up now, so the first edit doesn't wait for TypeScript to load the project.
    this.check().catch((error: unknown) => console.warn(`[checker] ${projectRoot}: ${error instanceof Error ? error.message : String(error)}`));
  }

  check(): Promise<Diagnostic[]> {
    if (this.disposed) return Promise.reject(new Error("the typechecker was shut down"));
    const worker = this.worker ?? this.start();
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`typecheck took longer than ${TIMEOUT_MS / 1000} s`));
      }, TIMEOUT_MS);
      this.waiting.set(id, { resolve, reject, timer });
      worker.postMessage({ id } satisfies CheckRequest);
    });
  }

  dispose(): void {
    this.disposed = true;
    void this.worker?.terminate();
  }

  private start(): Worker {
    const worker = new Worker(this.script, { workerData: { projectRoot: this.projectRoot } });
    worker.unref();
    worker.on("message", (response: CheckResponse) => {
      const pending = this.waiting.get(response.id);
      if (!pending) return;
      this.waiting.delete(response.id);
      clearTimeout(pending.timer);
      if (response.ok) pending.resolve(response.diagnostics);
      else pending.reject(new Error(response.error));
    });
    worker.on("error", (error) => {
      console.error(`[checker] ${this.projectRoot}: typecheck worker failed`, error);
      this.failAll(error);
    });
    worker.on("exit", (code) => {
      if (this.worker === worker) this.worker = null;
      if (!this.disposed) console.error(`[checker] ${this.projectRoot}: typecheck worker exited (${code}); the next check restarts it`);
      this.failAll(new Error(`typecheck worker exited (${code})`));
    });
    this.worker = worker;
    return worker;
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.waiting) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.waiting.delete(id);
    }
  }
}

/** Diagnostics in `after` that weren't in `before` (by file, code and message; lines move). */
export function introduced(before: Diagnostic[], after: Diagnostic[]): Diagnostic[] {
  const key = (d: Diagnostic) => `${d.file}\u0000${d.code}\u0000${d.message}`;
  const counts = new Map<string, number>();
  for (const d of before) counts.set(key(d), (counts.get(key(d)) ?? 0) + 1);
  return after.filter((d) => {
    const n = counts.get(key(d)) ?? 0;
    if (n > 0) {
      counts.set(key(d), n - 1);
      return false;
    }
    return true;
  });
}

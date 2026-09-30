// Dev server manager (T1.3): one Vite process per project. Source edits are Vite's
// job (HMR); the process restarts only when dependencies change.

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import type { DevServerState, DevServerStatus, LogLine } from "../ipc/contract.js";
import { runCommand, type RunCommand } from "../project/scaffold.js";

export type { DevServerState, DevServerStatus, LogLine } from "../ipc/contract.js";

export interface DevServerDeps {
  /** Runs `pnpm install` etc. */
  run: RunCommand;
  freePort: () => Promise<number>;
  spawnVite: (projectRoot: string, port: number) => ChildProcess;
  watchFile: (file: string, onChange: () => void) => FSWatcher;
  pnpm: string;
  /** How long to wait for Vite's "Local:" line before giving up. */
  startTimeoutMs: number;
  /** Quiet period after a package.json / lockfile change before acting. */
  debounceMs: number;
}

const MAX_LOG_LINES = 2000;
// Vite prints e.g. "  ➜  Local:   http://127.0.0.1:5173/"
const LOCAL_URL = /Local:\s+(https?:\/\/[^\s]+)/;
const ERROR_LINE = /\berror\b|\bfailed\b|✘|ERR_/i;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export const defaultDevServerDeps: DevServerDeps = {
  run: runCommand,
  freePort,
  spawnVite: (projectRoot, port) => {
    const vite = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
    if (!existsSync(vite)) throw new Error("Vite isn't installed in this project (no node_modules/vite); run pnpm install");
    // process.execPath is Electron in the app; ELECTRON_RUN_AS_NODE makes it plain Node,
    // so users don't need Node on their PATH.
    return spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: projectRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NO_COLOR: "1", FORCE_COLOR: "0", BROWSER: "none" },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  },
  watchFile: (file, onChange) => watch(file, { persistent: false }, onChange),
  pnpm: process.env["SKELETON_PNPM"] ?? "pnpm",
  startTimeoutMs: 30_000,
  debounceMs: 400,
};

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

/** One project's server. */
class DevServer {
  private child: ChildProcess | null = null;
  private state: DevServerState = "stopped";
  private url: string | null = null;
  private port: number | null = null;
  private lastError: string | null = null;
  private starts = 0;
  private logs: LogLine[] = [];
  private seq = 0;
  private watchers: FSWatcher[] = [];
  private depsSignature: string | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  /** Serialises start/stop/restart so they never interleave. */
  private queue: Promise<void> = Promise.resolve();
  private stopping = false;

  constructor(
    readonly projectRoot: string,
    private readonly deps: DevServerDeps,
  ) {}

  status(sinceSeq: number): DevServerStatus {
    return {
      projectRoot: this.projectRoot,
      state: this.state,
      url: this.url,
      port: this.port,
      lastError: this.lastError,
      starts: this.starts,
      logs: this.logs.filter((l) => l.seq > sinceSeq),
      lastSeq: this.seq,
    };
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      if (this.child) return;
      this.depsSignature = await this.readDepsSignature();
      this.watchDependencies();
      await this.launch();
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      this.unwatch();
      await this.kill();
      this.setState("stopped");
    });
  }

  /** Waits for queued work; for tests and shutdown. */
  idle(): Promise<void> {
    return this.queue;
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    // Keep the chain alive after a failure, but never drop the error.
    this.queue = next.catch((cause: unknown) => {
      this.fail(`dev server task failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return next;
  }

  private async launch(): Promise<void> {
    this.url = null;
    this.lastError = null;
    this.port = await this.deps.freePort();
    this.starts += 1;
    this.setState("starting");
    this.log("skeleton", "info", `Starting Vite on port ${this.port}…`);
    let child: ChildProcess;
    try {
      child = this.deps.spawnVite(this.projectRoot, this.port);
    } catch (cause) {
      this.fail(`could not start Vite: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    this.child = child;
    this.pipe(child, "stdout");
    this.pipe(child, "stderr");
    child.on("error", (err) => {
      if (this.child === child) this.fail(`Vite process error: ${err.message}`);
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.clearStartTimer();
      if (this.stopping) return;
      const why = `Vite exited unexpectedly (${signal ?? `code ${code ?? "?"}`})`;
      this.lastError = why;
      this.log("skeleton", "error", why);
      this.setState("crashed");
    });
    this.startTimer = setTimeout(() => {
      if (this.child === child && this.state === "starting") {
        this.fail(`Vite didn't report a URL within ${Math.round(this.deps.startTimeoutMs / 1000)} s`);
        void this.kill();
      }
    }, this.deps.startTimeoutMs);
  }

  private pipe(child: ChildProcess, stream: "stdout" | "stderr"): void {
    let buffered = "";
    child[stream]?.setEncoding("utf8");
    child[stream]?.on("data", (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const raw of lines) {
        const text = raw.replace(ANSI, "");
        if (text.trim() === "") continue;
        const level = stream === "stderr" || ERROR_LINE.test(text) ? "error" : "info";
        this.log(stream, level, text);
        if (level === "error") this.lastError = text.trim();
        const local = LOCAL_URL.exec(text);
        if (local && this.child === child && this.state === "starting") {
          this.url = local[1] as string;
          this.port = Number(new URL(this.url).port) || this.port;
          this.lastError = null;
          this.clearStartTimer();
          this.setState("running");
        }
      }
    });
  }

  private async kill(): Promise<void> {
    const child = this.child;
    this.clearStartTimer();
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.child = null;
      return;
    }
    this.stopping = true;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const signal = (sig: NodeJS.Signals) => {
      try {
        // Detached on POSIX: kill the whole group (Vite's esbuild children too).
        if (child.pid !== undefined && process.platform !== "win32") process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch (err) {
        if (!(err instanceof Error && "code" in err && err.code === "ESRCH")) throw err;
      }
    };
    signal("SIGTERM");
    const timeout = setTimeout(() => signal("SIGKILL"), 3000);
    await exited;
    clearTimeout(timeout);
    this.child = null;
    this.stopping = false;
  }

  private watchDependencies(): void {
    this.unwatch();
    for (const file of ["package.json", "pnpm-lock.yaml"]) {
      const abs = path.join(this.projectRoot, file);
      try {
        this.watchers.push(this.deps.watchFile(abs, () => this.onDependencyFileChange()));
      } catch (cause) {
        this.log("skeleton", "error", `Can't watch ${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
  }

  private unwatch(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = null;
  }

  private onDependencyFileChange(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.enqueue(async () => {
        const signature = await this.readDepsSignature();
        if (signature === this.depsSignature) return; // e.g. a script or name edit: Vite doesn't care
        this.depsSignature = signature;
        this.log("skeleton", "info", "Dependencies changed: installing and restarting Vite…");
        await this.kill();
        this.setState("installing");
        try {
          await this.deps.run(this.deps.pnpm, ["install", "--prefer-offline", "--ignore-workspace"], this.projectRoot);
        } catch (cause) {
          this.fail(`pnpm install failed: ${cause instanceof Error ? cause.message : String(cause)}`);
          return;
        }
        await this.launch();
      });
    }, this.deps.debounceMs);
  }

  /** Dependencies as declared plus the lockfile's hash: what should trigger a reinstall. */
  private async readDepsSignature(): Promise<string> {
    const read = (file: string) => readFile(path.join(this.projectRoot, file), "utf8").catch(() => "");
    const [pkgText, lock] = await Promise.all([read("package.json"), read("pnpm-lock.yaml")]);
    let declared: unknown = null;
    try {
      const pkg = JSON.parse(pkgText) as Record<string, unknown>;
      declared = [pkg["dependencies"], pkg["devDependencies"], pkg["optionalDependencies"], pkg["pnpm"]];
    } catch {
      // Mid-write or invalid JSON: treat the raw text as the signature so a later valid write still differs.
      declared = pkgText;
    }
    return createHash("sha256").update(JSON.stringify(declared)).update("\0").update(lock).digest("hex");
  }

  private fail(message: string): void {
    this.lastError = message;
    this.log("skeleton", "error", message);
    this.setState("failed");
  }

  private setState(state: DevServerState): void {
    this.state = state;
  }

  private clearStartTimer(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  private log(stream: LogLine["stream"], level: LogLine["level"], text: string): void {
    this.logs.push({ seq: ++this.seq, time: Date.now(), stream, level, text });
    if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
  }
}

export class DevServerManager {
  private readonly servers = new Map<string, DevServer>();

  constructor(private readonly deps: DevServerDeps = defaultDevServerDeps) {}

  async start(projectRoot: string): Promise<DevServerStatus> {
    const server = this.get(projectRoot);
    await server.start();
    return server.status(Number.POSITIVE_INFINITY);
  }

  async stop(projectRoot: string): Promise<DevServerStatus> {
    const server = this.servers.get(projectRoot);
    if (!server) return this.emptyStatus(projectRoot);
    await server.stop();
    return server.status(Number.POSITIVE_INFINITY);
  }

  status(projectRoot: string, sinceSeq = 0): DevServerStatus {
    return this.servers.get(projectRoot)?.status(sinceSeq) ?? this.emptyStatus(projectRoot);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.servers.values()].map((s) => s.stop()));
  }

  /** For tests: waits until queued restarts etc. have finished. */
  async idle(projectRoot: string): Promise<void> {
    await this.servers.get(projectRoot)?.idle();
  }

  private get(projectRoot: string): DevServer {
    let server = this.servers.get(projectRoot);
    if (!server) {
      server = new DevServer(projectRoot, this.deps);
      this.servers.set(projectRoot, server);
    }
    return server;
  }

  private emptyStatus(projectRoot: string): DevServerStatus {
    return { projectRoot, state: "stopped", url: null, port: null, lastError: null, starts: 0, logs: [], lastSeq: 0 };
  }
}

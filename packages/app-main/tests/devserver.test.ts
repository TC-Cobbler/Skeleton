import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DevServerManager, defaultDevServerDeps, type DevServerDeps } from "../src/devserver/manager.js";
import { scaffoldProject } from "../src/project/scaffold.js";

/** A stand-in for Vite's process: write to its streams, emit exit. */
let nextPid = 424242;

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = nextPid++;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.exit(null, signal ?? "SIGTERM");
    return true;
  });
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

const until = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
};

function fakeSetup(overrides: Partial<DevServerDeps> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "skeleton-devserver-"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { react: "1" } }));
  const children: FakeChild[] = [];
  const watchers = new Map<string, () => void>();
  const run = vi.fn(async () => "");
  const deps: DevServerDeps = {
    ...defaultDevServerDeps,
    run,
    freePort: async () => 5999,
    spawnVite: () => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as ChildProcess;
    },
    watchFile: (file, onChange) => {
      watchers.set(path.basename(file), onChange);
      return { close: () => watchers.delete(path.basename(file)) } as unknown as ReturnType<DevServerDeps["watchFile"]>;
    },
    startTimeoutMs: 200,
    debounceMs: 10,
    ...overrides,
  };
  const manager = new DevServerManager(deps);
  // POSIX kills the process group via process.kill(-pid); route that to the fake.
  vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    const child = children.find((c) => c.pid === Math.abs(pid));
    child?.exit(null, (signal as NodeJS.Signals) ?? "SIGTERM");
    return true;
  });
  return { dir, manager, children, watchers, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("DevServerManager (fake Vite)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("goes running when Vite prints its Local URL, and logs output", async () => {
    const { dir, manager, children, cleanup } = fakeSetup();
    expect((await manager.start(dir)).state).toBe("starting");
    children[0]?.stdout.write("\u001b[32m  VITE v8.3.1\u001b[0m  ready in 300 ms\n\n  ➜  Local:   http://127.0.0.1:5999/\n");
    await until(() => manager.status(dir).state === "running");
    const status = manager.status(dir);
    expect(status.url).toBe("http://127.0.0.1:5999/");
    expect(status.port).toBe(5999);
    expect(status.logs.map((l) => l.text)).toContain("  VITE v8.3.1  ready in 300 ms");
    expect(manager.status(dir, status.lastSeq).logs).toEqual([]);
    await manager.stop(dir);
    expect(manager.status(dir).state).toBe("stopped");
    cleanup();
  });

  it("flags error lines and keeps the latest as lastError", async () => {
    const { dir, manager, children, cleanup } = fakeSetup();
    await manager.start(dir);
    children[0]?.stdout.write("  ➜  Local:   http://127.0.0.1:5999/\n");
    children[0]?.stderr.write("[vite] Internal server error: Transform failed with 1 error\n");
    await until(() => manager.status(dir).lastError !== null);
    const errors = manager.status(dir).logs.filter((l) => l.level === "error");
    expect(errors.map((l) => l.text)).toEqual(["[vite] Internal server error: Transform failed with 1 error"]);
    expect(manager.status(dir).state).toBe("running");
    await manager.stop(dir);
    cleanup();
  });

  it("reports a crash when Vite exits on its own", async () => {
    const { dir, manager, children, cleanup } = fakeSetup();
    await manager.start(dir);
    children[0]?.stdout.write("  ➜  Local:   http://127.0.0.1:5999/\n");
    await until(() => manager.status(dir).state === "running");
    children[0]?.exit(1);
    expect(manager.status(dir)).toMatchObject({ state: "crashed", lastError: "Vite exited unexpectedly (code 1)" });
    cleanup();
  });

  it("fails if Vite never reports a URL", async () => {
    const { dir, manager, cleanup } = fakeSetup();
    await manager.start(dir);
    await until(() => manager.status(dir).state === "failed");
    expect(manager.status(dir).lastError).toMatch(/didn't report a URL/);
    cleanup();
  });

  it("restarts only when dependencies change", async () => {
    const { dir, manager, children, watchers, run, cleanup } = fakeSetup();
    await manager.start(dir);
    children[0]?.stdout.write("  ➜  Local:   http://127.0.0.1:5999/\n");
    await until(() => manager.status(dir).state === "running");

    // A non-dependency edit: no install, no restart.
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "renamed", dependencies: { react: "1" } }));
    watchers.get("package.json")?.();
    await new Promise((r) => setTimeout(r, 50));
    await manager.idle(dir);
    expect(run).not.toHaveBeenCalled();
    expect(manager.status(dir).starts).toBe(1);

    // A new dependency: install, then a fresh Vite.
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "renamed", dependencies: { react: "1", sonner: "2" } }));
    watchers.get("package.json")?.();
    await until(() => manager.status(dir).starts === 2);
    await manager.idle(dir);
    expect(run).toHaveBeenCalledWith("pnpm", ["install", "--prefer-offline", "--ignore-workspace"], dir);
    expect(children[0]?.signalCode).toBe("SIGTERM");
    children[1]?.stdout.write("  ➜  Local:   http://127.0.0.1:5999/\n");
    await until(() => manager.status(dir).state === "running");

    // A lockfile change (e.g. the agent ran pnpm add) also counts.
    writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    watchers.get("pnpm-lock.yaml")?.();
    await until(() => manager.status(dir).starts === 3);
    await manager.stop(dir);
    cleanup();
  });

  it("reports a failed install", async () => {
    const { dir, manager, children, watchers, cleanup } = fakeSetup({
      run: async () => {
        throw new Error("pnpm install exited with 1: offline");
      },
    });
    await manager.start(dir);
    children[0]?.stdout.write("  ➜  Local:   http://127.0.0.1:5999/\n");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "2" } }));
    watchers.get("package.json")?.();
    await until(() => manager.status(dir).state === "failed");
    expect(manager.status(dir).lastError).toBe("pnpm install failed: pnpm install exited with 1: offline");
    cleanup();
  });
});

describe("DevServerManager (real Vite on a scaffolded project)", () => {
  const parentDir = mkdtempSync(path.join(tmpdir(), "skeleton-devserver-real-"));
  let root = "";
  const manager = new DevServerManager();

  beforeAll(async () => {
    root = (await scaffoldProject({ parentDir, name: "Dev Server Test" }, { skeletonVersion: "0" })).projectRoot;
  }, 120_000);

  afterAll(async () => {
    await manager.stopAll();
    rmSync(parentDir, { recursive: true, force: true });
  });

  it("serves the project, survives source edits without restarting, and stops", async () => {
    await manager.start(root);
    await until(() => manager.status(root).state !== "starting", 30_000);
    const status = manager.status(root);
    expect(status.state, status.lastError ?? "").toBe("running");
    const html = await (await fetch(status.url as string)).text();
    expect(html).toContain('<div id="root"></div>');
    const page = await (await fetch(new URL("/src/pages/HomePage.tsx", status.url as string))).text();
    expect(page).toContain("Dev Server Test");

    // A source edit is HMR's job: same process.
    const file = path.join(root, "src/pages/HomePage.tsx");
    writeFileSync(file, readFileSync(file, "utf8").replace("Dev Server Test", "Edited Title"));
    await new Promise((r) => setTimeout(r, 1000));
    expect(manager.status(root).starts).toBe(1);
    expect(await (await fetch(new URL("/src/pages/HomePage.tsx", status.url as string))).text()).toContain("Edited Title");

    await manager.stop(root);
    expect(manager.status(root).state).toBe("stopped");
    await expect(fetch(status.url as string)).rejects.toThrow();
  }, 90_000);
});

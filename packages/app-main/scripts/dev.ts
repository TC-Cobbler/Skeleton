// Dev loop: build main + core, start the renderer's Vite server, then launch Electron
// pointed at it. Renderer changes hot-reload; main changes need a restart.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rendererUrl = "http://localhost:5199/";

const isWindows = process.platform === "win32";

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  detached = false,
): ChildProcess {
  return spawn(cmd, args, {
    cwd: pkgRoot,
    stdio: "inherit",
    env,
    shell: isWindows,
    detached: detached && !isWindows,
  });
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`renderer did not come up at ${url}: ${String(lastError)}`);
}

const build = spawnSync("pnpm", ["exec", "tsc", "-b"], {
  cwd: pkgRoot,
  stdio: "inherit",
  shell: isWindows,
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Own process group on POSIX, so stopping pnpm also stops the Vite it spawned.
const vite = run(
  "pnpm",
  ["--filter", "@skeleton/app-renderer", "dev"],
  process.env,
  true,
);
const stop = (code: number): never => {
  killTree(vite);
  process.exit(code);
};
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

try {
  await waitFor(rendererUrl, 30_000);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  stop(1);
}

const electron = run(
  "pnpm",
  ["exec", "electron", ".", ...process.argv.slice(2)],
  {
    ...process.env,
    SKELETON_RENDERER_URL: rendererUrl,
  },
);
electron.on("exit", (code) => stop(code ?? 0));

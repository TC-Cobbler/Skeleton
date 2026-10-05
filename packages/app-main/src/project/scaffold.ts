// Project scaffolder (T1.2): renders the template, installs dependencies and makes
// the initial commit. Main-process only: it owns the filesystem and child processes.

import { execFile } from "node:child_process";
import { commandLine } from "./command.js";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { reason, type Reason } from "@skeleton/core";
import { loadTemplate, packageNameFor, projectNameError, renderProject, type ProjectFiles } from "@skeleton/templates";

export interface ScaffoldRequest {
  /** Absolute path of the folder the project folder is created in. */
  parentDir: string;
  /** Human project name; the folder is its slug (`packageNameFor`). */
  name: string;
}

export interface ScaffoldResult {
  projectRoot: string;
  /** Hash of the initial `skeleton: scaffold` commit. */
  commit: string;
  /** Milliseconds per step, for Gate 1 (new project → running app in under 30 s). */
  timings: { write: number; install: number; git: number };
}

export type ScaffoldStep = "validate" | "write" | "install" | "git";

export class ScaffoldError extends Error {
  readonly reason: Reason;

  constructor(
    readonly step: ScaffoldStep,
    message: string,
    options?: { cause?: unknown; reason?: Reason },
  ) {
    super(`scaffold failed at ${step}: ${message}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ScaffoldError";
    this.reason = options?.reason ?? reason("create-failed", { step });
  }
}

/** Runs a command, resolving with stdout; rejects with stderr in the message on failure. */
export type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;

export const runCommand: RunCommand = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const line = commandLine(command, args);
    execFile(line.file, line.args, { cwd, shell: line.shell, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: "true" } }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${command} ${args.join(" ")} exited with ${error.code ?? "an error"}: ${stderr.trim() || error.message}`, { cause: error }));
      else resolve(stdout);
    });
  });

export interface ScaffoldOptions {
  skeletonVersion: string;
  run?: RunCommand;
  /** Package manager binary. Defaults to $SKELETON_PNPM or `pnpm`. */
  pnpm?: string;
  template?: ProjectFiles;
  onProgress?: (step: ScaffoldStep) => void;
}

const GIT_FALLBACK_IDENTITY = ["-c", "user.name=Skeleton", "-c", "user.email=skeleton@localhost"];

export async function scaffoldProject(request: ScaffoldRequest, options: ScaffoldOptions): Promise<ScaffoldResult> {
  const run = options.run ?? runCommand;
  const pnpm = options.pnpm ?? process.env["SKELETON_PNPM"] ?? "pnpm";
  const progress = options.onProgress ?? (() => undefined);

  progress("validate");
  const nameError = projectNameError(request.name);
  if (nameError) throw new ScaffoldError("validate", nameError, { reason: reason("bad-project-name", { name: request.name }) });
  if (!path.isAbsolute(request.parentDir)) throw new ScaffoldError("validate", "parentDir must be an absolute path");
  const parent = await stat(request.parentDir).catch(() => null);
  if (!parent?.isDirectory()) throw new ScaffoldError("validate", `${request.parentDir} is not a folder`, { reason: reason("folder-missing", { folder: request.parentDir }) });
  const projectRoot = path.join(request.parentDir, packageNameFor(request.name));
  if (await stat(projectRoot).catch(() => null)) {
    throw new ScaffoldError("validate", `${projectRoot} already exists`, { reason: reason("project-exists", { folder: projectRoot }) });
  }

  const files = renderProject(options.template ?? loadTemplate(), { name: request.name, skeletonVersion: options.skeletonVersion });
  const timings = { write: 0, install: 0, git: 0 };
  let step: ScaffoldStep = "write";
  try {
    progress("write");
    let t = Date.now();
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(projectRoot, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
    timings.write = Date.now() - t;

    step = "install";
    progress("install");
    t = Date.now();
    await run(pnpm, ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-workspace"], projectRoot);
    timings.install = Date.now() - t;

    step = "git";
    progress("git");
    t = Date.now();
    await run("git", ["init", "-q", "-b", "main"], projectRoot);
    await run("git", ["add", "-A"], projectRoot);
    const identity = await run("git", ["config", "user.email"], projectRoot).then(
      () => [],
      () => GIT_FALLBACK_IDENTITY,
    );
    await run("git", [...identity, "commit", "-q", "-m", "skeleton: scaffold"], projectRoot);
    const commit = (await run("git", ["rev-parse", "HEAD"], projectRoot)).trim();
    timings.git = Date.now() - t;
    return { projectRoot, commit, timings };
  } catch (cause) {
    // Only ever removes the folder this call created (it didn't exist above).
    await rm(projectRoot, { recursive: true, force: true });
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ScaffoldError(step, message, { cause });
  }
}


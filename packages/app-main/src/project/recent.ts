// Recent projects (T1.4), kept as JSON in the app's user-data folder.

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectInfo, RecentProject } from "../ipc/contract.js";

const MAX_RECENT = 12;

interface StoredRecent {
  projectRoot: string;
  name: string;
  lastOpened: number;
}

/** Reads `skeleton/config.json`; null if `projectRoot` isn't a Skeleton project. */
export async function readProjectInfo(projectRoot: string): Promise<ProjectInfo | null> {
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, "skeleton", "config.json"), "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    throw err;
  }
  const config: unknown = JSON.parse(text);
  const name =
    typeof config === "object" && config !== null && typeof (config as Record<string, unknown>)["name"] === "string"
      ? ((config as Record<string, unknown>)["name"] as string)
      : path.basename(projectRoot);
  return { projectRoot, name };
}

export class RecentProjects {
  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Most recent first; `missing` when the folder or its Skeleton config is gone. */
  async list(): Promise<RecentProject[]> {
    const stored = await this.read();
    return Promise.all(
      stored.map(async (r) => ({
        ...r,
        missing: !(await stat(path.join(r.projectRoot, "skeleton", "config.json")).catch(() => null)),
      })),
    );
  }

  async touch(project: ProjectInfo): Promise<void> {
    const stored = (await this.read()).filter((r) => r.projectRoot !== project.projectRoot);
    stored.unshift({ projectRoot: project.projectRoot, name: project.name, lastOpened: this.now() });
    await this.write(stored.slice(0, MAX_RECENT));
  }

  async forget(projectRoot: string): Promise<void> {
    await this.write((await this.read()).filter((r) => r.projectRoot !== projectRoot));
  }

  private async read(): Promise<StoredRecent[]> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return [];
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      // A corrupt list isn't worth blocking the app over, but it isn't silent either.
      console.error(`[recent] ignoring unreadable ${this.file}`, cause);
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is StoredRecent =>
        typeof r === "object" &&
        r !== null &&
        typeof r.projectRoot === "string" &&
        typeof r.name === "string" &&
        typeof r.lastOpened === "number",
    );
  }

  /** Write-then-rename so a crash never leaves a half-written file. */
  private async write(list: StoredRecent[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(list, null, 2));
    await rename(tmp, this.file);
  }
}

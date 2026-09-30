// Git service (T1.5): commit, log, diff between commits, revert to a commit.
// Plain git CLI through an injectable runner. Main-process only.

import { runCommand, type RunCommand } from "../project/scaffold.js";
import type { GitCommit, GitDiff, GitFileDiff, GitStatus } from "../ipc/contract.js";

export class GitError extends Error {
  constructor(
    readonly operation: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`git ${operation}: ${message}`, options);
    this.name = "GitError";
  }
}

const REV = /^[0-9a-f]{4,40}$/i;
const GIT_FALLBACK_IDENTITY = ["-c", "user.name=Skeleton", "-c", "user.email=skeleton@localhost"];
const FIELD = "\u001f";
const RECORD = "\u001e";

export class GitService {
  constructor(private readonly run: RunCommand = runCommand) {}

  async status(root: string): Promise<GitStatus> {
    const out = await this.git("status", root, ["status", "--porcelain=v1", "-z"]);
    const changed = out
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.slice(3));
    const head = await this.git("status", root, ["rev-parse", "HEAD"]).then((h) => h.trim());
    return { head, clean: changed.length === 0, changed };
  }

  /**
   * Stages everything and commits. Returns null when there was nothing to commit,
   * unless `allowEmpty` (a loop commit that marks a point even with no changes, ADR 011).
   */
  async commit(root: string, message: string, options: { allowEmpty?: boolean } = {}): Promise<GitCommit | null> {
    const subject = message.trim();
    if (subject === "") throw new GitError("commit", "message is empty");
    await this.git("commit", root, ["add", "-A"]);
    const staged = await this.git("commit", root, ["diff", "--cached", "--name-only"]);
    if (staged.trim() === "" && !options.allowEmpty) return null;
    const identity = await this.run("git", ["config", "user.email"], root).then(
      () => [],
      () => GIT_FALLBACK_IDENTITY,
    );
    await this.git("commit", root, [...identity, "commit", "-q", ...(options.allowEmpty ? ["--allow-empty"] : []), "-m", subject]);
    const [latest] = await this.log(root, 1);
    if (!latest) throw new GitError("commit", "commit succeeded but HEAD is missing");
    return latest;
  }

  /** Newest first. */
  async log(root: string, limit: number): Promise<GitCommit[]> {
    const out = await this.git("log", root, ["log", `-n${Math.max(1, Math.floor(limit))}`, `--format=%H${FIELD}%s${FIELD}%ct${RECORD}`]);
    return out
      .split(RECORD)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [hash, subject, time] = r.split(FIELD) as [string, string, string];
        return { hash, subject, time: Number(time) * 1000 };
      });
  }

  /** Per-file diff from `from` to `to` (a commit), or to the working tree when `to` is null. */
  async diff(root: string, from: string, to: string | null): Promise<GitDiff> {
    const fromRev = await this.resolve(root, "diff", from);
    const toRev = to === null ? null : await this.resolve(root, "diff", to);
    const range = toRev ? [fromRev, toRev] : [fromRev];
    const statuses = await this.git("diff", root, ["diff", "--name-status", "-z", "--no-renames", ...range, "--"]);
    const numstat = await this.git("diff", root, ["diff", "--numstat", "-z", "--no-renames", ...range, "--"]);

    const counts = new Map<string, { additions: number; deletions: number }>();
    const nums = numstat.split("\0").filter(Boolean);
    for (const entry of nums) {
      const [add, del, path] = entry.split("\t") as [string, string, string];
      // Binary files show "-"; count them as 0 lines.
      counts.set(path, { additions: Number(add) || 0, deletions: Number(del) || 0 });
    }

    const parts = statuses.split("\0").filter(Boolean);
    const files: GitFileDiff[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const code = parts[i] as string;
      const path = parts[i + 1] as string;
      const patch = await this.git("diff", root, ["diff", "--no-renames", ...range, "--", path]);
      files.push({
        path,
        status: code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified",
        ...(counts.get(path) ?? { additions: 0, deletions: 0 }),
        patch,
      });
    }
    return { from: fromRev, to: toRev, files };
  }

  /**
   * Makes the project match `commit` again, as a new commit on top of history
   * (nothing is rewritten, so a revert can itself be undone). Refuses to run over
   * uncommitted changes, which it would otherwise throw away.
   */
  async revert(root: string, commit: string, message?: string): Promise<GitCommit> {
    const target = await this.resolve(root, "revert", commit);
    const status = await this.status(root);
    if (!status.clean) {
      throw new GitError("revert", `the project has uncommitted changes (${status.changed.slice(0, 5).join(", ")}); commit or discard them first`);
    }
    if (status.head === target) throw new GitError("revert", `already at ${target.slice(0, 7)}`);
    await this.git("revert", root, ["restore", `--source=${target}`, "--staged", "--worktree", ":/"]);
    const made = await this.commit(root, message ?? `skeleton: revert to ${target.slice(0, 7)}`);
    if (!made) throw new GitError("revert", `the project already matches ${target.slice(0, 7)}`);
    return made;
  }

  /** The files under `paths` (project-relative) as they were in `rev`, by project-relative path. */
  async snapshot(root: string, rev: string, paths: string[]): Promise<Record<string, string>> {
    const target = await this.resolve(root, "snapshot", rev);
    const listed = await this.git("snapshot", root, ["ls-tree", "-r", "-z", "--name-only", target, "--", ...paths]);
    const out: Record<string, string> = {};
    for (const file of listed.split("\0").filter(Boolean)) {
      out[file] = await this.git("snapshot", root, ["show", `${target}:${file}`]);
    }
    return out;
  }

  /** The project's first commit (the scaffold). */
  async rootCommit(root: string): Promise<string> {
    const out = await this.git("rootCommit", root, ["rev-list", "--max-parents=0", "HEAD"]);
    const first = out.trim().split("\n").pop();
    if (!first) throw new GitError("rootCommit", "the project has no commits");
    return first;
  }

  private async resolve(root: string, operation: string, rev: string): Promise<string> {
    if (!REV.test(rev) && rev !== "HEAD") throw new GitError(operation, `not a commit hash: ${JSON.stringify(rev)}`);
    try {
      return (await this.run("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], root)).trim();
    } catch (cause) {
      throw new GitError(operation, `unknown commit ${rev}`, { cause });
    }
  }

  private async git(operation: string, root: string, args: string[]): Promise<string> {
    try {
      return await this.run("git", args, root);
    } catch (cause) {
      throw new GitError(operation, cause instanceof Error ? cause.message : String(cause), { cause });
    }
  }
}

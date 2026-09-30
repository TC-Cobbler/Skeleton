import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ScaffoldError, scaffoldProject, type RunCommand } from "../src/project/scaffold.js";

const parentDir = mkdtempSync(path.join(tmpdir(), "skeleton-scaffold-"));
afterAll(() => rmSync(parentDir, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("scaffoldProject (real pnpm + git)", () => {
  it("creates an installed, committed project that builds", async () => {
    const steps: string[] = [];
    const result = await scaffoldProject(
      { parentDir, name: "Gaming Library" },
      { skeletonVersion: "0.0.0-test", onProgress: (s) => steps.push(s) },
    );
    expect(steps).toEqual(["validate", "write", "install", "git"]);
    expect(result.projectRoot).toBe(path.join(parentDir, "gaming-library"));
    const root = result.projectRoot;

    expect(existsSync(path.join(root, "node_modules/.pnpm"))).toBe(true);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toContain("node_modules");
    expect(git(root, "log", "--format=%s")).toBe("skeleton: scaffold");
    expect(git(root, "rev-parse", "HEAD")).toBe(result.commit);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(git(root, "ls-files")).not.toMatch(/node_modules/);

    execFileSync("pnpm", ["build"], { cwd: root, stdio: "pipe" });
    expect(existsSync(path.join(root, "dist/index.html"))).toBe(true);
  }, 180_000);

  it("refuses an existing folder and bad input without writing anything", async () => {
    await expect(scaffoldProject({ parentDir, name: "Gaming Library" }, { skeletonVersion: "0" })).rejects.toThrow(/already exists/);
    await expect(scaffoldProject({ parentDir: "relative", name: "X" }, { skeletonVersion: "0" })).rejects.toThrow(/absolute/);
    await expect(scaffoldProject({ parentDir: path.join(parentDir, "missing"), name: "X" }, { skeletonVersion: "0" })).rejects.toThrow(/not a folder/);
    await expect(scaffoldProject({ parentDir, name: "../escape" }, { skeletonVersion: "0" })).rejects.toThrow(ScaffoldError);
  });

  it("removes the half-made project when a step fails", async () => {
    const failInstall: RunCommand = async (command) => {
      if (command === "pnpm") throw new Error("pnpm install exited with 1: offline");
      return "";
    };
    const error = await scaffoldProject({ parentDir, name: "Broken" }, { skeletonVersion: "0", run: failInstall }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScaffoldError);
    expect((error as ScaffoldError).step).toBe("install");
    expect((error as ScaffoldError).message).toMatch(/scaffold failed at install: pnpm install exited with 1: offline/);
    expect(existsSync(path.join(parentDir, "broken"))).toBe(false);
  });
});

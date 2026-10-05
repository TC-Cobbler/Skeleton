import { describe, expect, it } from "vitest";
import { commandLine } from "../src/project/command.js";

describe("commandLine", () => {
  it("runs commands directly on Linux and macOS", () => {
    for (const platform of ["linux", "darwin"] as const) {
      expect(commandLine("pnpm", ["install", "--prefer-offline"], platform)).toEqual({ file: "pnpm", args: ["install", "--prefer-offline"], shell: false });
    }
  });

  it("runs pnpm through the shell on Windows, where it's pnpm.cmd (ENOENT otherwise)", () => {
    expect(commandLine("pnpm", ["install", "--frozen-lockfile", "--ignore-workspace"], "win32")).toEqual({
      file: "pnpm",
      args: ["install", "--frozen-lockfile", "--ignore-workspace"],
      shell: true,
    });
  });

  it("quotes what cmd.exe would split, and leaves .exe files to run directly", () => {
    expect(commandLine("C:\\Program Files\\nodejs\\pnpm.cmd", ["commit", "-m", 'skeleton: handoff #1 "x"'], "win32")).toEqual({
      file: '"C:\\Program Files\\nodejs\\pnpm.cmd"',
      args: ["commit", "-m", '"skeleton: handoff #1 ""x"""'],
      shell: true,
    });
    expect(commandLine("C:\\Git\\bin\\git.exe", ["status"], "win32")).toEqual({ file: "C:\\Git\\bin\\git.exe", args: ["status"], shell: false });
    // git is git.exe, which execFile finds without the shell: commit messages never meet cmd.exe.
    expect(commandLine("git", ["commit", "-m", "100% done"], "win32")).toEqual({ file: "git", args: ["commit", "-m", "100% done"], shell: false });
  });
});

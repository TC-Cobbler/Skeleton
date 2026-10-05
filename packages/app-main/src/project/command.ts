// How Skeleton runs the project's tools (pnpm, git). On Windows, pnpm is a .cmd shim:
// execFile can't find it without the shell (ENOENT), and Node refuses to run a .cmd
// file without the shell at all (CVE-2024-27980). So on Windows, .cmd shims go through
// the shell, with each argument quoted for cmd.exe. Real executables (git.exe, which
// execFile finds by itself) still run directly, so their arguments never meet cmd.exe.

export interface CommandLine {
  file: string;
  args: string[];
  shell: boolean;
}

/** `command args…` as execFile should run it on `platform`. */
export function commandLine(command: string, args: string[], platform: NodeJS.Platform = process.platform): CommandLine {
  if (platform !== "win32" || !isShim(command)) return { file: command, args, shell: false };
  return { file: quoteForCmd(command), args: args.map(quoteForCmd), shell: true };
}

/** Package managers install as .cmd shims on Windows; anything named .cmd or .bat is one. */
function isShim(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command) || /^(pnpm|npm|npx|yarn)$/i.test(command.replace(/^.*[\\/]/, ""));
}

/** An argument cmd.exe passes through as one: plain words as they are, anything else in double quotes. */
function quoteForCmd(arg: string): string {
  return /^[\w@./:=+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

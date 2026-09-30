// Copies the curated shadcn/ui (new-york-v4) components into the project template,
// adapted for Skeleton. Run: tsx scripts/vendor-shadcn.ts <path to shadcn-ui/ui checkout>
// See ../VENDORED.md and docs/decisions/004-project-template.md.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** PRD §9.1 palette, plus what Form and Sidebar need (Label, Tooltip, Skeleton). */
export const CURATED = [
  "button", "input", "textarea", "select", "checkbox", "switch", "form", "label",
  "card", "badge", "avatar", "table", "tabs", "separator",
  "dialog", "sheet", "dropdown-menu", "sonner",
  "sidebar", "tooltip", "skeleton",
] as const;

/**
 * Radius classes switched to per-component tokens (PRD §10.1). For each file: the
 * upstream class and, per occurrence in order, what it becomes (null = keep). The
 * script fails if upstream no longer has exactly that many occurrences.
 */
const RADIUS: Record<string, [string, (string | null)[]][]> = {
  "button.tsx": [["rounded-md", ["rounded-button", "rounded-button", "rounded-button", "rounded-button", "rounded-button"]]],
  "card.tsx": [["rounded-xl", ["rounded-card"]]],
  "input.tsx": [["rounded-md", ["rounded-input"]]],
  "textarea.tsx": [["rounded-md", ["rounded-input"]]],
  "select.tsx": [["rounded-md", ["rounded-input", "rounded-popover"]]],
  "dialog.tsx": [["rounded-lg", ["rounded-dialog"]]],
  "badge.tsx": [["rounded-full", ["rounded-badge"]]],
  "dropdown-menu.tsx": [["rounded-md", ["rounded-popover", "rounded-popover"]]],
  "tooltip.tsx": [["rounded-md", ["rounded-popover"]]],
};

const root = process.argv[2];
if (!root) throw new Error("usage: vendor-shadcn.ts <shadcn-ui/ui checkout>");
const registry = join(root, "apps/v4/registry/new-york-v4");
const out = fileURLToPath(new URL("../project/src/", import.meta.url));
const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function adapt(file: string, source: string): string {
  let s = source
    .replace(/^"use client"\n\n?/, "")
    .replaceAll('from "cn"', 'from "@/lib/utils"')
    .replaceAll('from "@/registry/new-york-v4/ui/', 'from "@/components/ui/')
    .replaceAll('from "@/registry/new-york-v4/hooks/', 'from "@/hooks/');
  for (const [from, targets] of RADIUS[file] ?? []) {
    const re = new RegExp(`(?<=[\\s"'\`])${from}(?=[\\s"'\`])`, "g");
    const count = s.match(re)?.length ?? 0;
    if (count !== targets.length) throw new Error(`${file}: expected ${targets.length} × ${from}, found ${count}`);
    let i = 0;
    s = s.replace(re, (match) => targets[i++] ?? match);
  }
  if (file === "sonner.tsx") {
    // Skeleton toggles dark mode with the .dark class (PRD §10.5), not next-themes.
    s = s
      .replace('import { useTheme } from "next-themes"\n', 'import { useDocumentTheme } from "@/hooks/use-document-theme"\n')
      .replace('const { theme = "system" } = useTheme()', "const theme = useDocumentTheme()");
    if (s.includes("next-themes")) throw new Error("sonner.tsx: next-themes still referenced");
  }
  return `// Vendored from shadcn/ui new-york-v4 @ ${commit.slice(0, 12)}, adapted for Skeleton.\n${s}`;
}

mkdirSync(join(out, "components/ui"), { recursive: true });
mkdirSync(join(out, "hooks"), { recursive: true });
for (const name of CURATED) {
  const file = `${name}.tsx`;
  writeFileSync(join(out, "components/ui", file), adapt(file, readFileSync(join(registry, "ui", file), "utf8")));
}
writeFileSync(join(out, "hooks/use-mobile.ts"), adapt("use-mobile.ts", readFileSync(join(registry, "hooks/use-mobile.ts"), "utf8")));
console.log(`vendored ${CURATED.length} components from ${commit}`);

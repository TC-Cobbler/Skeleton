// The violations panel's data (T4.6): every violation in the project's source,
// described by core, with the ones the user kept marked. Reads only.

import path from "node:path";
import { describeViolations, readPalette, type DesignContext } from "@skeleton/core";
import { GLOBALS_CSS } from "@skeleton/templates";
import type { ViolationItem, ViolationReport } from "../ipc/contract.js";

/** Scaffold code (shadcn internals, primitives) is exempt, as on take-back (core's analyser). */
const SCAFFOLD_DIRS = ["src/components/ui/", "src/components/layout/"];

export const CONFIG_FILE = "skeleton/config.json";

/** Tailwind's own theme, for the values of palette colours such as `bg-red-500`. */
const TAILWIND_THEME = "node_modules/tailwindcss/theme.css";

export interface ViolationsIO {
  readFile(absolutePath: string): Promise<string>;
  listSources(projectRoot: string): Promise<string[]>;
}

/** A kept violation, as stored in skeleton/config.json's `acknowledgedViolations`. */
export interface KeptViolation {
  file: string;
  id: string | null;
  value: string;
}

export async function designContext(io: ViolationsIO, projectRoot: string): Promise<DesignContext> {
  const css = await io.readFile(path.join(projectRoot, GLOBALS_CSS));
  const theme = await io.readFile(path.join(projectRoot, TAILWIND_THEME)).catch((err: unknown) => {
    // Not installed (yet): palette colours just get no nearest token.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  });
  return { css, palette: readPalette(theme) };
}

export async function listViolations(io: ViolationsIO, projectRoot: string): Promise<ViolationReport> {
  const ctx = await designContext(io, projectRoot);
  const kept = readKept(await io.readFile(path.join(projectRoot, CONFIG_FILE)));
  const items: ViolationItem[] = [];
  const errors: string[] = [];
  for (const file of await io.listSources(projectRoot)) {
    if (SCAFFOLD_DIRS.some((d) => file.startsWith(d))) continue;
    const source = await io.readFile(path.join(projectRoot, file));
    try {
      for (const v of describeViolations(source, file, ctx)) {
        items.push({ ...v, kept: kept.some((k) => k.file === v.file && k.id === (v.element?.id ?? null) && k.value === v.value) });
      }
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { items, errors };
}

/** The kept violations in a config.json's text; a config without the list keeps none. */
export function readKept(configText: string): KeptViolation[] {
  const config = JSON.parse(configText) as { acknowledgedViolations?: unknown };
  const list = config.acknowledgedViolations;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (k): k is KeptViolation =>
      typeof k === "object" && k !== null && typeof k.file === "string" && (k.id === null || typeof k.id === "string") && typeof k.value === "string",
  );
}

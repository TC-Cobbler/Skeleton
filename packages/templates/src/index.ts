// The project template Skeleton scaffolds (T1.2). Loading reads the template
// directory; rendering is pure. Writing to disk, installing and git live in app-main.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mintId, type Random } from "@skeleton/core";

/** Project-relative POSIX path → file contents. */
export type ProjectFiles = Record<string, string>;

export const TEMPLATE_DIR = fileURLToPath(new URL("../project/", import.meta.url));

/** Files stored under a different name in the template (npm strips a real .gitignore). */
const RENAMES: Record<string, string> = { gitignore: ".gitignore" };

export function loadTemplate(dir: string = TEMPLATE_DIR): ProjectFiles {
  const out: ProjectFiles = {};
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = join(abs, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const rel = relative(dir, path).split(sep).join("/");
        out[RENAMES[rel] ?? rel] = readFileSync(path, "utf8");
      }
    }
  };
  walk(dir);
  return out;
}

export interface ProjectVars {
  /** Human name, e.g. "Gaming Library". Shown in the app and docs. */
  name: string;
  skeletonVersion: string;
  random?: Random;
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._'-]{0,63}$/;

/** Why `name` can't be used as a project name, or null if it can. */
export function projectNameError(name: string): string | null {
  if (name.trim() !== name) return "Name can't start or end with a space.";
  if (!NAME_PATTERN.test(name)) {
    return "Use 1–64 letters, numbers, spaces, dots, dashes, underscores or apostrophes, starting with a letter or number.";
  }
  if (packageNameFor(name) === "") return "Name needs at least one letter or number.";
  return null;
}

/** npm-safe package and folder name: "Gaming Library" → "gaming-library". */
export function packageNameFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PLACEHOLDER = /\{\{(name|packageName|skeletonVersion|id:[a-z]+)\}\}/g;

/**
 * Fill in the template. Each `{{id:key}}` gets a freshly minted `data-ui-id`
 * (the same key gets the same ID across files); every ID is unique.
 */
export function renderProject(template: ProjectFiles, vars: ProjectVars): ProjectFiles {
  const error = projectNameError(vars.name);
  if (error) throw new Error(`invalid project name ${JSON.stringify(vars.name)}: ${error}`);
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  const values: Record<string, string> = {
    name: vars.name,
    packageName: packageNameFor(vars.name),
    skeletonVersion: vars.skeletonVersion,
  };
  const out: ProjectFiles = {};
  for (const [path, content] of Object.entries(template)) {
    out[path] = content.replace(PLACEHOLDER, (_, key: string) => {
      if (key.startsWith("id:")) {
        let id = ids.get(key);
        if (!id) {
          id = mintId(taken, vars.random);
          ids.set(key, id);
        }
        return id;
      }
      return values[key] as string;
    });
  }
  return out;
}

export {
  ELEMENTS,
  GRID_CLASSES,
  STACK_CLASSES,
  PALETTE,
  PALETTE_GROUPS,
  PLAIN_ELEMENTS,
  moduleFile,
  templateComponents,
  templateFiles,
  templateImports,
  type ClassGroup,
  type ElementSchema,
  type PaletteGroup,
  type PaletteItem,
  type PropSchema,
} from "./palette.js";
export { componentFor, pageNameError, pathFor, renderPage } from "./page.js";

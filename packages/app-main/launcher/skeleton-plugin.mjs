// Skeleton's dev-only Vite plugin (ADR 006). Added by vite-launcher.mjs; never
// written into the user's project, and absent from production builds.
//
// 1. Tags every JSX element in page files with
//    data-skeleton-loc="<file>:<offset>@<version>", in the served code only. <offset>
//    is the element's start in the file on disk, the same number core's parser reports
//    as range.start; <version> is core's sourceVersion of the file's text, so the
//    overlay never maps DOM to a tree parsed from a different version of the file.
// 2. Injects the overlay and serves it as a Vite module (so it gets import.meta.hot).
// 3. Has Vite pre-bundle the dependencies of every source file at startup, not just
//    those the current pages import. Otherwise placing the first component of a
//    kind (T3.2) makes Vite discover a new dependency and reload the whole canvas.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import MagicString from "magic-string";
import { sourceVersion } from "@skeleton/core/version";

export const OVERLAY_URL = "/@skeleton/overlay.js";
const LOC_ATTR = "data-skeleton-loc";
const FRAGMENTS = new Set(["Fragment", "React.Fragment"]);

/** Name of a JSX opening element, e.g. "Card", "Motion.div", "svg:path". */
function nameOf(node) {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return `${nameOf(node.object)}.${node.property.name}`;
}

/**
 * Adds the loc attribute to every JSX element in `code`. `file` is the
 * project-relative path written into the attribute; `sourcePath` (absolute) names the
 * source in the source map. Returns null if nothing changed.
 */
export function tagJsx(code, file, sourcePath = file) {
  const version = sourceVersion(code);
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: false });
  const s = new MagicString(code);
  let changed = false;
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXElement") {
      const opening = node.openingElement;
      const alreadyTagged = opening.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === LOC_ATTR);
      if (!FRAGMENTS.has(nameOf(opening.name)) && !alreadyTagged) {
        s.appendLeft(opening.name.end, ` ${LOC_ATTR}="${file}:${node.start}@${version}"`);
        changed = true;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra" || key === "leadingComments" || key === "trailingComments") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
    }
  };
  visit(ast.program);
  return changed ? { code: s.toString(), map: s.generateMap({ hires: true, source: sourcePath, includeContent: true }) } : null;
}

/**
 * @param {{ root: string, overlayBundle: string, pagesDir?: string }} options
 */
export function skeletonPlugin({ root, overlayBundle, pagesDir = "src/pages" }) {
  const pagesAbs = path.join(root, pagesDir) + path.sep;
  return {
    name: "skeleton",
    enforce: "pre",
    apply: "serve",
    config() {
      return { optimizeDeps: { entries: ["index.html", "src/**/*.{ts,tsx,js,jsx}"] } };
    },
    resolveId(id) {
      return id === OVERLAY_URL ? OVERLAY_URL : null;
    },
    load(id) {
      if (id !== OVERLAY_URL) return null;
      return readFileSync(overlayBundle, "utf8");
    },
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.startsWith(pagesAbs) || !/\.(tsx|jsx)$/.test(file)) return null;
      const rel = path.relative(root, file).split(path.sep).join("/");
      try {
        return tagJsx(code, rel, file);
      } catch (cause) {
        // A syntax error: let Vite's own transform report it to the user.
        this.warn(`skeleton: couldn't tag ${rel}: ${cause instanceof Error ? cause.message : String(cause)}`);
        return null;
      }
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { type: "module", src: OVERLAY_URL }, injectTo: "body" }];
    },
  };
}

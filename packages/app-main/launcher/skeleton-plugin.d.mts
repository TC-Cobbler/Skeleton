import type { Plugin } from "vite";

export const OVERLAY_URL: string;
export function tagJsx(code: string, file: string, sourcePath?: string): { code: string; map: unknown } | null;
export function pageFileOf(id: string, root: string, pagesDir?: string, p?: typeof import("node:path")): string | null;
export function skeletonPlugin(options: { root: string; overlayBundle: string; pagesDir?: string }): Plugin;

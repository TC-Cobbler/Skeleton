import type { PageEntry } from "@skeleton/app-main/ipc";

/**
 * The page a pathname shows: the deepest matching route with a page file.
 * Static segments beat `:params`; a trailing `*` matches the rest.
 */
export function matchPage(pages: PageEntry[], pathname: string): PageEntry | null {
  const split = (p: string) => (p.replace(/\/+$/, "") || "/").split("/");
  const target = split(pathname);
  let best: PageEntry | null = null;
  let bestScore = -1;
  for (const page of pages) {
    const pattern = split(page.path);
    let score = 0;
    let ok = pattern.length === target.length || pattern.at(-1) === "*";
    for (let i = 0; ok && i < pattern.length; i++) {
      const seg = pattern[i] as string;
      if (seg === "*") break;
      if (seg.startsWith(":")) score += 1;
      else if (seg === target[i]) score += 2;
      else ok = false;
    }
    // >= so a nested leaf route (listed after its layout) wins over the layout.
    if (ok && page.file && score >= bestScore) {
      best = page;
      bestScore = score;
    }
  }
  return best;
}

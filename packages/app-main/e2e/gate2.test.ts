// Gate 2: open the Phase 0 post-agent fixtures and see every element selectable,
// locked blocks clearly marked, and the tree matching the canvas.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Frame, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "src/pages/HomePage.tsx";

interface FlatNode {
  key: string;
  kind: string;
  name: string;
  id: string | null;
  element: boolean;
  start: number;
  lockReason: string | null;
}

for (const fixture of ["loop-01", "loop-02"]) {
  describe(`Gate 2 on fixtures/post-agent/${fixture}`, () => {
    const work = mkdtempSync(path.join(tmpdir(), `skeleton-gate2-${fixture}-`));
    const projectRoot = path.join(work, fixture);
    let app: ElectronApplication;
    let page: Page;
    let nodes: FlatNode[] = [];
    const frame = (): Frame => {
      const f = page.frames().find((fr) => fr.url().startsWith("http://127.0.0.1:"));
      if (!f) throw new Error("no canvas frame");
      return f;
    };
    const report: string[] = [];

    beforeAll(async () => {
      cpSync(path.resolve(pkgRoot, `../../fixtures/post-agent/${fixture}`), projectRoot, { recursive: true });
      execFileSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-workspace"], { cwd: projectRoot, stdio: "pipe" });
      const env = Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "SKELETON_RENDERER_URL"),
      );
      app = await _electron.launch({
        args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
        cwd: pkgRoot,
        env: { ...env, SKELETON_USER_DATA: path.join(work, "profile") },
      });
      page = await app.firstWindow();
      // Size the real window, not an emulated viewport: CDP input to points outside the
      // real window reaches the page but never a cross-process iframe (KI-1).
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
      await page.waitForFunction(() => window.innerWidth === 1600 && window.innerHeight === 1000);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
      }, projectRoot);
      await page.getByRole("button", { name: "Open…" }).click();
      await page.frameLocator('[data-testid="canvas-frame"]').getByRole("heading", { name: "Orders" }).waitFor({ timeout: 60_000 });

      // The same tree the UI uses, through the same IPC.
      const result = await page.evaluate(
        ({ root, file }) => window.skeleton.invoke("page:tree", { projectRoot: root, file }),
        { root: projectRoot, file: FILE },
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      const flat: FlatNode[] = [];
      type N = { kind: string; name: string; id: string | null; element: boolean; lockReason: string | null; range: { start: number }; children: N[] };
      const walk = (n: N, key: string) => {
        flat.push({ key, kind: n.kind, name: n.name, id: n.id, element: n.element, start: n.range.start, lockReason: n.lockReason });
        n.children.forEach((c, i) => walk(c, `${key}.${i}`));
      };
      (result.value.roots as N[]).forEach((r, i) => walk(r, String(i)));
      nodes = flat;
    }, 180_000);

    afterAll(async () => {
      console.log(`Gate 2 (${fixture}):\n  ${report.join("\n  ")}`);
      await app?.close();
      rmSync(work, { recursive: true, force: true });
    });

    it("tree matches the canvas", async () => {
      const locs = await frame().evaluate(() =>
        [...document.querySelectorAll("[data-skeleton-loc]")].map((el) => el.getAttribute("data-skeleton-loc") ?? ""),
      );
      const offsets = new Set(locs.filter((l) => l.startsWith(`${FILE}:`)).map((l) => Number(/:(\d+)@/.exec(l)?.[1])));
      const starts = new Set(nodes.filter((n) => n.element).map((n) => n.start));
      // Every tagged DOM element is a node in the tree...
      for (const o of offsets) expect(starts.has(o), `DOM loc ${o} has no tree node`).toBe(true);
      // ...and every tree node rendered as a host element is in the overlay's map.
      const onScreen = await page.locator('[role="treeitem"]').evaluateAll((items) =>
        items.filter((i) => !i.classList.contains("is-offscreen")).map((i) => i.getAttribute("data-key")),
      );
      const rendered = nodes.filter((n) => offsets.has(n.start));
      for (const n of rendered) expect(onScreen, `${n.name} ${n.id ?? ""} rendered but not mapped`).toContain(n.key);
      expect(await page.locator('[role="treeitem"]').count()).toBe(nodes.length);
      report.push(`tree: ${nodes.length} nodes, ${rendered.length} rendered as tagged host elements, ${onScreen.length} mapped on screen`);
    });

    it("marks every rendered locked block", async () => {
      const html = await frame().evaluate(() => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "");
      const onScreen = new Set(
        await page.locator('[role="treeitem"]').evaluateAll((items) =>
          items.filter((i) => !i.classList.contains("is-offscreen")).map((i) => i.getAttribute("data-key")),
        ),
      );
      const locked = nodes.filter((n) => n.kind === "locked" && onScreen.has(n.key));
      const labels = [...html.matchAll(/<div class="label"[^>]*>🔒 ([^<]+)<\/div>/g)].map((m) => m[1]);
      expect(locked.length).toBeGreaterThan(0);
      expect(labels.length).toBeGreaterThanOrEqual(locked.length);
      expect(html).toMatch(/dashed #ea580c/);
      report.push(`locked: ${locked.length} rendered locked blocks, ${labels.length} 🔒 labels drawn`);
    });

    it("every element is selectable", async () => {
      if (process.env["GATE2_LAYOUT"]) await page.getByRole("button", { name: process.env["GATE2_LAYOUT"] }).click();
      await page.waitForTimeout(500);
      const ids = nodes.filter((n) => n.id !== null);
      await page.evaluate(() => {
        const log: string[] = [];
        (window as unknown as { __msgs: string[] }).__msgs = log;
        window.addEventListener("message", (e) => {
          const d = e.data as { type?: string; key?: string | null };
          if (d && d.type && d.type !== "mapped") log.push(`${d.type}:${d.key ?? ""}`);
        });
      });
      let byClick = 0;
      let byTree = 0;
      for (const n of ids) {
        // Aim once the overlay has settled: the previous selection's handles arrive a
        // moment after it, and a point they cover takes the press (KI-1).
        const overlayNow = () => frame().evaluate(() => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "");
        for (let prev = await overlayNow(); ; ) {
          await page.waitForTimeout(100);
          const next = await overlayNow();
          if (next === prev) break;
          prev = next;
        }
        // A point where this element is the topmost thing (not a child), scanning a grid over it.
        const target = await frame().evaluate((id) => {
          const el = [...document.querySelectorAll(`[data-ui-id="${id}"]`)].find((e) => (e as HTMLElement).offsetParent !== null || e.getClientRects().length > 0);
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "center" });
          const r = el.getBoundingClientRect();
          for (let fy = 0.1; fy < 1; fy += 0.2) {
            for (let fx = 0.05; fx < 1; fx += 0.1) {
              const x = r.x + r.width * fx;
              const y = r.y + r.height * fy;
              // The element must own the point and a 4px margin around it (diagonals
              // included), so scaling and pixel rounding of the real click can't land on
              // a neighbour. "Own" as the overlay decides it: nothing of Skeleton's layer
              // on top (the selection's handles and label take a press there), then down
              // into any child whose box holds the point, because elementFromPoint skips
              // disabled (pointer-events: none) buttons and the overlay selects them.
              const deepest = (from: Element, px: number, py: number): Element => {
                for (let i = from.children.length - 1; i >= 0; i--) {
                  const b = (from.children[i] as Element).getBoundingClientRect();
                  if (b.width > 0 && b.height > 0 && px >= b.left && px < b.right && py >= b.top && py < b.bottom) return deepest(from.children[i] as Element, px, py);
                }
                return from;
              };
              const owns = (px: number, py: number) => {
                const hit = document.elementFromPoint(px, py);
                return hit !== null && hit.tagName !== "SKELETON-OVERLAY" && deepest(hit, px, py).closest("[data-skeleton-loc]") === el;
              };
              const margin = [-4, 0, 4].flatMap((dx) => [-4, 0, 4].map((dy) => [dx, dy] as const));
              if (margin.every(([dx, dy]) => owns(x + dx, y + dy))) return { x, y, scrollY: window.scrollY };
            }
          }
          return { x: -1, y: -1, scrollY: window.scrollY };
        }, n.id as string);
        const row = page.locator(`[role="treeitem"][data-key="${n.key}"]`);
        if (target && target.x >= 0) {
          const outer = await page.getByTestId("canvas-frame").evaluate((el) => {
            const f = el as HTMLIFrameElement;
            const r = f.getBoundingClientRect();
            const cs = getComputedStyle(f);
            return { x: r.x, y: r.y, l: parseFloat(cs.borderLeftWidth), t: parseFloat(cs.borderTopWidth), s: Number(f.style.zoom || 1) };
          });
          // Let the browser paint after the scroll (so its hit-test data for the
          // iframe is current), then move and click like a person would.
          await frame().evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const px = outer.x + (outer.l + target.x) * outer.s;
          const py = outer.y + (outer.t + target.y) * outer.s;
          await page.mouse.move(px, py);
          await page.mouse.click(px, py);
          // One click, where the overlay itself would say this element is: it must
          // select it. (The clicks KI-1 reported as lost were how the test aimed and
          // sized the window; see docs/known-issues.md.)
          const selectedNow = () => page.getByTestId("selection-id").textContent();
          await expect.poll(selectedNow, { timeout: 3000, message: `${n.id}: clicking it on the canvas should select it` }).toBe(n.id);
          expect(await row.getAttribute("aria-selected")).toBe("true");
          byClick++;
        } else {
          // Covered entirely by children, or no DOM of its own (e.g. a component
          // that renders only its children): select from the tree and check the
          // canvas draws it.
          await row.click();
          await expect.poll(() => page.getByTestId("selection-id").textContent()).toBe(n.id);
          if (target) {
            await expect
              .poll(() => frame().evaluate(() => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? ""))
              .toContain(`#${n.id}</div>`);
          }
          byTree++;
        }
      }
      report.push(
        `selectable: ${ids.length} ID'd elements, ${byClick} by clicking the canvas, ${byTree} from the tree (no point of their own)`,
      );
      expect(byClick + byTree).toBe(ids.length);
    }, 240_000);
  });
}

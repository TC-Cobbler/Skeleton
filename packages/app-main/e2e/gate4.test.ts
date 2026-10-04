// Gate 4: PRD flow F3 (tune) passes in all three scopes, in light and in dark mode,
// on a newly created project, with the real mouse.
//
// - Plain drag on a Button's radius handle: every Button updates live, and
//   --radius-button changes in globals.css.
// - Shift-drag: the base --radius changes, and every derived radius follows.
// - Alt-drag: only that Button changes, and a violation appears.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildTree, diffSources, findNodeById, readTokens } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, canvasPoint, clickOnCanvas, dragGizmo } from "./canvas-click.js";
import { canvasCopy, copy, names, pattern, startsWith, ui } from "./ui.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-gate4-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "gate-four");
const read = (rel: string) => readFileSync(path.join(projectRoot, rel), "utf8");
const css = () => read("src/styles/globals.css");
const home = () => read("src/pages/HomePage.tsx");
const token = (name: string, block: "light" | "theme-inline" = "theme-inline", text = css()) =>
  readTokens(text).find((t) => t.name === name && t.block === block)?.value;
const frame = () => canvasFrame(page);
const buttons = () => frame().locator("button[data-slot=button]");
const radii = () => buttons().evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)));
/** Radius of the Button with `id`, and of the others (DOM order isn't placement order). */
const radiiBy = (id: string) =>
  buttons().evaluateAll(
    (els, target) => ({
      own: els.filter((el) => el.getAttribute("data-ui-id") === target).map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))[0] ?? NaN,
      others: els.filter((el) => el.getAttribute("data-ui-id") !== target).map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
    }),
    id,
  );
const cardRadius = () =>
  frame()
    .locator("[data-slot=card]")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
const radiusHandle = () => frame().locator('skeleton-overlay .gz[data-kind="radius"]');
const label = () =>
  frame()
    .locator("skeleton-overlay [data-gizmo-label]")
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => null);
/** Lines that differ between two versions of a file with the same number of lines. */
const changedLines = (before: string, after: string) => {
  const b = before.split("\n");
  const a = after.split("\n");
  expect(a.length).toBe(b.length);
  return a.filter((line, i) => line !== b[i]);
};
const violationsTab = () => ui(page).tab("violations");

let first = "";

beforeAll(async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: pkgRoot,
    env: { ...env, SKELETON_USER_DATA: path.join(scratch, "profile") },
  });
  page = await app.firstWindow();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, scratch);
  await ui(page).picker.changeFolder().click();
  await ui(page).picker.projectName().fill("Gate Four");
  await ui(page).picker.create().click();
  await frame().getByRole("heading", { name: "Gate Four" }).waitFor({ timeout: 90_000 });
  // Three Buttons, one in a Card (whose radius is derived from --radius too). Gate 3
  // covers placing them from the palette; here the page is written as an agent would.
  const source = home();
  const ids = { first: "ui_gate1", second: "ui_gate2", card: "ui_gate3", content: "ui_gate4", third: "ui_gate5" };
  first = ids.first;
  writeFileSync(
    path.join(projectRoot, "src/pages/HomePage.tsx"),
    source
      .replace('import { Container, Stack } from "@/components/layout";', 'import { Container, Stack } from "@/components/layout";\nimport { Button } from "@/components/ui/button";\nimport { Card, CardContent } from "@/components/ui/card";')
      .replace(
        "</h1>\n",
        `</h1>\n        <Button data-ui-id="${ids.first}">One</Button>\n        <Button data-ui-id="${ids.second}">Two</Button>\n` +
          `        <Card data-ui-id="${ids.card}">\n          <CardContent data-ui-id="${ids.content}">\n            <Button data-ui-id="${ids.third}">Three</Button>\n          </CardContent>\n        </Card>\n`,
      ),
  );
  await buttons().nth(2).waitFor({ timeout: 20_000 });
  expect(await buttons().count()).toBe(3);
  await ui(page).showLayers();
  await page.getByTestId(`layer-${ids.third}`).waitFor({ timeout: 20_000 });
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe.each(["light", "dark"] as const)("Gate 4: F3 in %s mode", (mode) => {
  it("shows the mode", async () => {
    await ui(page).tab("element").click();
    await ui(page).colourMode().getByRole("button", { name: mode === "dark" ? copy.app.dark : copy.app.light }).click();
    await expect.poll(() => frame().locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(mode === "dark");
    await clickOnCanvas(page, "canvas-frame", frame().locator(`[data-ui-id="${first}"]`));
    expect(await page.getByTestId("selection-id").textContent()).toBe(first);
    await radiusHandle().waitFor();
  });

  it("plain drag: every Button updates live; --radius-button changes in globals.css", async () => {
    const before = await radii();
    const cssBefore = css();
    const pageBefore = home();
    await expect
      .poll(
        async () => {
          // The handle moves as the radius settles: aim again each time.
          const hover = await canvasPoint(page, "canvas-frame", radiusHandle());
          await page.mouse.move(hover.x, hover.y + 1);
          await page.mouse.move(hover.x, hover.y);
          return label();
        },
        { timeout: 10_000 },
      )
      .toMatch(startsWith(canvasCopy.gizmos.hover(canvasCopy.gizmos.radiusComponent(names.themeName("--radius-button"), names.kindOf("Button")))));
    await dragGizmo(page, radiusHandle(), 12, 12, {
      during: async () => {
        const live = await radii();
        expect(live[0]).toBeGreaterThan(before[0] as number);
        expect(new Set(live).size).toBe(1); // all three Buttons, the one in the Card too
        expect(await label()).toMatch(pattern(/^/, canvasCopy.gizmos.readout(names.themeName("--radius-button"), ""), /.*/, canvasCopy.gizmos.dragging("", canvasCopy.gizmos.elements(3)), /$/));
        expect(css()).toBe(cssBefore); // live only: nothing written during the drag
      },
    });
    await expect.poll(() => token("--radius-button"), { timeout: 10_000 }).not.toBe(token("--radius-button", "theme-inline", cssBefore));
    expect(changedLines(cssBefore, css())).toEqual([`  --radius-button: ${token("--radius-button")};`]);
    expect(token("--radius-button")).toMatch(/^calc\(var\(--radius\) \* [\d.]+\)$/); // still derived from --radius
    expect(home()).toBe(pageBefore);
    await expect.poll(async () => new Set(await radii()).size).toBe(1);
    expect((await radii())[0]).toBeGreaterThan(before[0] as number);
  });

  it("Shift-drag: the base --radius changes, and derived radii follow", async () => {
    const cssBefore = css();
    const pageBefore = home();
    const buttonBefore = (await radii())[0] as number;
    const cardBefore = await cardRadius();
    await dragGizmo(page, radiusHandle(), -8, -8, {
      modifier: "Shift",
      during: async () => {
        expect(await label()).toMatch(pattern(/^/, canvasCopy.gizmos.readout(names.themeName("--radius"), ""), /[\d.]+px · \d+ elements$/));
        expect(await cardRadius()).toBeLessThan(cardBefore); // a derived radius follows live
      },
    });
    await expect.poll(() => token("--radius", "light"), { timeout: 10_000 }).not.toBe(token("--radius", "light", cssBefore));
    expect(changedLines(cssBefore, css())).toEqual([`  --radius: ${token("--radius", "light")};`]);
    expect(home()).toBe(pageBefore);
    // Every derived radius follows the base.
    await expect.poll(cardRadius).toBeLessThan(cardBefore);
    const after = await radii();
    expect(new Set(after).size).toBe(1);
    expect(after[0]).toBeLessThan(buttonBefore);
    const base = parseFloat(token("--radius", "light") as string) * 16;
    const factor = Number(/\* ([\d.]+)\)$/.exec(token("--radius-button") as string)?.[1]);
    expect(after[0]).toBeCloseTo(base * factor, 0);
    expect(await cardRadius()).toBeCloseTo(base * 1.6, 0);
  });

  it("Alt-drag: only that Button changes, and a violation appears", async () => {
    const cssBefore = css();
    const pageBefore = home();
    const before = await radiiBy(first);
    await dragGizmo(page, radiusHandle(), 10, 10, {
      modifier: "Alt",
      during: async () => expect(await label()).toMatch(pattern(/^[\d.]+px/, canvasCopy.gizmos.dragging("", canvasCopy.gizmos.thisElement), /$/)),
    });
    await expect.poll(() => findNodeById(buildTree(home()).roots, first)?.props["className"], { timeout: 10_000 }).toMatch(/^rounded-\[\d+px\]$/);
    expect(css()).toBe(cssBefore);
    // One minimal diff: only that Button's element (Prettier may wrap its tag, ADR 009).
    const diff = diffSources(pageBefore, home());
    expect(diff.hunks).toHaveLength(1);
    const removed = diff.patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain(`data-ui-id="${first}"`);
    const range = findNodeById(buildTree(home()).roots, first)?.range;
    expect(diff.hunks[0]?.newStart).toBe(range?.startLine);
    expect((diff.hunks[0]?.newStart ?? 0) + (diff.hunks[0]?.newLines ?? 0) - 1).toBe(range?.endLine);
    await expect.poll(async () => (await radiiBy(first)).own, { timeout: 10_000 }).toBeGreaterThan(before.own);
    expect((await radiiBy(first)).others).toEqual(before.others);
    await violationsTab().click();
    await expect.poll(() => violationsTab().textContent(), { timeout: 10_000 }).toBe(copy.app.tabs.violations(1));
    expect(await page.getByTestId("violation").first().textContent()).toContain(names.kindOf("Button"));
    expect(await page.getByTestId("violation").first().locator("[data-ui-id]").getAttribute("data-ui-id")).toBe(first);
    // Undo it, so the next mode starts from the same page.
    await ui(page).undo().click();
    await expect.poll(() => home(), { timeout: 10_000 }).toBe(pageBefore);
    await expect.poll(() => violationsTab().textContent(), { timeout: 10_000 }).toBe(copy.app.tabs.violations(0));
  });
});

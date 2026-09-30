// Gate 3 (PRD F2): on a new project, drag a Stack onto the page, drop a Card into it,
// then a Button inside the Card. Each drop must produce one minimal diff (only the new
// element's lines, plus at most one import line), the element must appear in the
// page's source with a data-ui-id, and the code must be valid: it parses, the
// project's own typecheck passes after every drop, and it builds at the end.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIdIndex, buildTree, diffSources, findNodeById, parseModule, UI_ID_PATTERN } from "@skeleton/core";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, placeFromPalette } from "./canvas-click.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-gate3-"));
const projectRoot = path.join(scratch, "gate-three");
const PAGE = "src/pages/HomePage.tsx";
const report: string[] = [];

let app: ElectronApplication;
let page: Page;

const source = () => readFileSync(path.join(projectRoot, PAGE), "utf8");
const node = (id: string) => findNodeById(buildTree(source()).roots, id);

function projectIds(): Map<string, number> {
  const files: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const e of readdirSync(path.join(projectRoot, rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (/\.(tsx|jsx)$/.test(e.name)) files[`${rel}/${e.name}`] = readFileSync(path.join(projectRoot, rel, e.name), "utf8");
    }
  };
  walk("src");
  return new Map([...buildIdIndex(files).ids].map(([id, occ]) => [id, occ.length]));
}

/**
 * One drop, checked on its own: the diff only adds lines (one block for the element,
 * at most one import line), nothing else moves, IDs stay unique, and `tsc -b` passes.
 */
async function drop(label: string, paletteId: string, target: () => ReturnType<ReturnType<typeof canvasFrame>["locator"]>, parentId: string): Promise<string> {
  const before = source();
  const idsBefore = projectIds();
  const started = Date.now();
  const id = await placeFromPalette(page, paletteId, target(), { fx: 0.5, fy: 0.5 });
  const elapsed = Date.now() - started;
  const after = source();

  // The code is valid: it parses, and the project's own typecheck passes.
  expect(() => parseModule(after), label).not.toThrow();
  execFileSync("pnpm", ["exec", "tsc", "-b"], { cwd: projectRoot, stdio: "pipe" });

  // One minimal diff: the element's lines and at most one import line are added, in at
  // most two places. The only existing line that may change is the parent's own tag,
  // and only by opening it (an empty `<Stack … />` becomes `<Stack …>`): a child can't
  // go into a self-closing element otherwise.
  const diff = diffSources(before, after);
  expect(diff.hunks.length, `${label}: hunks`).toBeLessThanOrEqual(2);
  const removed = diff.hunks.flatMap((h) => h.lines.filter((l) => l.startsWith("-")).map((l) => l.slice(1)));
  const added = diff.hunks.flatMap((h) => h.lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1)));
  const opened: string[] = [];
  if (removed.length > 0) {
    expect(removed.length, `${label}: lines removed`).toBe(1);
    const tag = removed[0] as string;
    expect(tag, `${label}: the removed line is the parent's tag`).toContain(`data-ui-id="${parentId}"`);
    const reopened = tag.replace(/\s*\/>$/, ">");
    expect(added, `${label}: the parent's tag is only opened`).toContain(reopened);
    opened.push(reopened);
  }
  const imports = added.filter((l) => l.startsWith("import "));
  expect(imports.length, `${label}: import lines`).toBeLessThanOrEqual(1);
  // Every other line that was there is still there, in order.
  const kept = before.split("\n").filter((l) => !removed.includes(l));
  expect(after.split("\n").filter((l) => kept.includes(l)), `${label}: existing lines`).toEqual(kept);

  // The element is in the source, where it was dropped, with a data-ui-id; so is everything in it.
  const placed = node(id);
  expect(placed, `${label}: placed element`).not.toBeNull();
  expect(node(parentId)?.children.some((c) => c.id === id), `${label}: parent`).toBe(true);
  const elementIds = [...added.filter((l) => !opened.includes(l)).join("\n").matchAll(/data-ui-id="([^"]+)"/g)].map((m) => m[1] as string);
  expect(elementIds.length, `${label}: new IDs`).toBeGreaterThan(0);
  for (const newId of elementIds) {
    expect(newId, label).toMatch(UI_ID_PATTERN);
    expect(idsBefore.has(newId), `${label}: ${newId} is new`).toBe(false);
  }
  const idsAfter = projectIds();
  for (const [existing] of idsBefore) expect(idsAfter.has(existing), `${label}: kept ${existing}`).toBe(true);
  expect([...idsAfter.values()].every((n) => n === 1), `${label}: IDs unique in the project`).toBe(true);

  report.push(
    `${label}: +${diff.linesAdded} −${diff.linesRemoved} lines in ${diff.hunks.length} hunk(s) (${imports.length} import${opened.length ? ", parent tag opened" : ""}), ` +
      `${elementIds.length} new ID(s), typecheck ok; ${elapsed} ms from drag to placed, checked and mapped`,
  );
  return id;
}

beforeAll(async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL"),
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
  await page.getByRole("button", { name: "Change…" }).click();
  await page.getByLabel("Project name").fill("Gate Three");
  await page.getByRole("button", { name: "Create project" }).click();
  await canvasFrame(page).getByRole("heading", { name: "Gate Three" }).waitFor({ timeout: 90_000 });
}, 180_000);

afterAll(async () => {
  console.log(`Gate 3 (PRD F2):\n  ${report.join("\n  ")}`);
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("Gate 3 (PRD F2)", () => {
  let stack = "";
  let card = "";

  it("drops a Stack onto the page", async () => {
    const root = /<Stack data-ui-id="(ui_[a-z0-9]{5})"/.exec(source())?.[1] as string;
    // Aim below the heading, into the page's stack.
    stack = await drop("Stack onto the page", "stack-vertical", () => canvasFrame(page).locator(`[data-ui-id="${root}"]`).first(), root);
    expect(node(stack)?.name).toBe("Stack");
  });

  it("drops a Card into the Stack", async () => {
    card = await drop("Card into the Stack", "card", () => canvasFrame(page).locator(`[data-ui-id="${stack}"]`), stack);
    expect(node(card)?.name).toBe("Card");
  });

  it("drops a Button inside the Card", async () => {
    const content = node(card)?.children.find((c) => c.name === "CardContent")?.id as string;
    const button = await drop("Button inside the Card", "button", () => canvasFrame(page).locator(`[data-ui-id="${content}"]`), content);
    expect(node(button)?.name).toBe("Button");
    await canvasFrame(page).getByRole("button", { name: "Button" }).waitFor();
  });

  it("builds", () => {
    execFileSync("pnpm", ["build"], { cwd: projectRoot, stdio: "pipe" });
    report.push("pnpm build (tsc -b && vite build): ok");
  }, 120_000);
});

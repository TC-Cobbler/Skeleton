// Phase 3 (composition) on a freshly scaffolded project: the palette, placing,
// moving and removing elements, and the properties panel. Gate 3 lives in gate3.test.ts.

import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildTree, findNodeById, parseModule, sourceVersion } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, canvasPoint, moveOnCanvas, placeFromPalette, waitForCanvas } from "./canvas-click.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-compose-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "compose");
const homeFile = () => readFileSync(path.join(projectRoot, "src/pages/HomePage.tsx"), "utf8");
const stackId = () => /<Stack data-ui-id="(ui_[a-z0-9]{5})"/.exec(homeFile())?.[1] as string;
const childNames = (id: string) => findNodeById(buildTree(homeFile()).roots, id)?.children.map((c) => c.name) ?? [];
/** Waits for the file to change from `before`, then for the canvas to show and map it. */
async function edited(before: string): Promise<string> {
  await expect.poll(homeFile, { timeout: 10_000 }).not.toBe(before);
  const after = homeFile();
  await waitForCanvas(page, sourceVersion(after));
  return after;
}

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
  await page.getByRole("button", { name: "Change…" }).click();
  await page.getByLabel("Project name").fill("Compose");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.frameLocator('[data-testid="canvas-frame"]').getByRole("heading", { name: "Compose" }).waitFor({ timeout: 90_000 });
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("palette (T3.1)", () => {
  it("lists the curated set by group, all placeable in a new project except Toast", async () => {
    const palette = page.getByRole("region", { name: "Palette" });
    await palette.getByTestId("palette-button").waitFor();
    for (const group of ["Layout", "Inputs", "Display", "Overlay", "Navigation"]) {
      await expect(palette.getByRole("list", { name: `${group} components` }).count()).resolves.toBe(1);
    }
    const items = palette.locator(".palette-item");
    expect(await items.count()).toBe(23);
    const disabled = await palette.locator('.palette-item[aria-disabled="true"]').allTextContents();
    expect(disabled).toEqual(["Toast"]);
    expect(await palette.getByTestId("palette-toast").getAttribute("title")).toMatch(/Toaster is already mounted/);
  });
});

describe("drag from the palette (T3.2)", () => {
  const frame = () => canvasFrame(page);
  const palette = (id: string) => page.getByRole("region", { name: "Palette" }).getByTestId(`palette-${id}`);
  const heading = () => frame().getByRole("heading", { name: "Compose" });

  it("drops a Button after the heading, with one minimal diff, and selects it", async () => {
    const before = homeFile();
    const id = await placeFromPalette(page, "button", heading(), { fx: 0.5, fy: 0.9 });
    const after = homeFile();
    expect(() => parseModule(after)).not.toThrow();
    expect(childNames(stackId())).toEqual(["h1", "Button"]);
    expect(findNodeById(buildTree(after).roots, id)?.name).toBe("Button");
    // Only added lines: the import and the element.
    const beforeLines = before.split("\n");
    expect(after.split("\n").filter((l) => beforeLines.includes(l))).toEqual(beforeLines);
    expect(after.split("\n").length - beforeLines.length).toBe(2);
    expect(after).toContain(`\n        <Button data-ui-id="${id}">Button</Button>\n      </Stack>`);
    expect(await page.getByTestId("selection-name").textContent()).toBe("Button");
    await frame().getByRole("button", { name: "Button" }).waitFor();
  });

  it("drops before the heading when aimed at its top half", async () => {
    await placeFromPalette(page, "badge", heading(), { fx: 0.5, fy: 0.1 });
    expect(childNames(stackId())).toEqual(["Badge", "h1", "Button"]);
  });

  it("drops into an empty stack, then into that stack along its row", async () => {
    const button = frame().getByRole("button", { name: "Button" });
    const row = await placeFromPalette(page, "stack-horizontal", button, { fx: 0.5, fy: 0.9 });
    expect(childNames(stackId())).toEqual(["Badge", "h1", "Button", "Stack"]);
    await placeFromPalette(page, "input", frame().locator(`[data-ui-id="${row}"]`), { fx: 0.5, fy: 0.5 });
    expect(childNames(row)).toEqual(["Input"]);
    const input = () => frame().locator(`[data-ui-id="${row}"] input`);
    await placeFromPalette(page, "button", input(), { fx: 0.9, fy: 0.5 });
    expect(childNames(row)).toEqual(["Input", "Button"]);
    // A horizontal stack: aimed at the input's left half, the drop goes first.
    await placeFromPalette(page, "badge", input(), { fx: 0.1, fy: 0.5 });
    expect(childNames(row)).toEqual(["Badge", "Input", "Button"]);
  });

  it("places into a Card's content, not into its title", async () => {
    const card = await placeFromPalette(page, "card", heading(), { fx: 0.5, fy: 0.9 });
    const content = findNodeById(buildTree(homeFile()).roots, card)?.children.find((c) => c.name === "CardContent")?.id as string;
    await placeFromPalette(page, "button", frame().locator(`[data-ui-id="${content}"]`), { fx: 0.5, fy: 0.9 });
    expect(childNames(content)).toEqual(["p", "Button"]);
    // Aimed at the title (text): it goes into the header, the nearest container, after the title.
    const header = findNodeById(buildTree(homeFile()).roots, card)?.children[0]?.id as string;
    await placeFromPalette(page, "badge", frame().getByText("Card title"), { fx: 0.5, fy: 0.9 });
    expect(childNames(header)).toEqual(["CardTitle", "Badge", "CardDescription"]);
  });

  it("changes nothing when released outside the canvas or cancelled with Escape", async () => {
    const before = homeFile();
    const item = await palette("card").boundingBox();
    const canvas = await page.getByTestId("canvas-frame").boundingBox();
    if (!item || !canvas) throw new Error("no boxes");
    // Released over the sidebar.
    await page.mouse.move(item.x + 5, item.y + 5);
    await page.mouse.down();
    await page.mouse.move(item.x + 40, item.y + 40, { steps: 3 });
    await page.mouse.up();
    // Escape while over the canvas, then released there.
    await page.mouse.move(item.x + 5, item.y + 5);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 60, { steps: 8 });
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(homeFile()).toBe(before);
    expect(await page.getByTestId("edit-error").count()).toBe(0);
  });
});

describe("move and reorder on the canvas (T3.3)", () => {
  const frame = () => canvasFrame(page);
  const el = (id: string) => frame().locator(`[data-ui-id="${id}"]`).first();
  const idOf = (parent: string, name: string) => findNodeById(buildTree(homeFile()).roots, parent)?.children.find((c) => c.name === name)?.id as string;

  it("reorders within a stack, as one moved line", async () => {
    // [Badge, h1, Card, Button, Stack] → the Badge goes after the Button.
    expect(childNames(stackId())).toEqual(["Badge", "h1", "Card", "Button", "Stack"]);
    const badge = idOf(stackId(), "Badge");
    const before = homeFile();
    await moveOnCanvas(page, el(badge), el(idOf(stackId(), "Button")), { fx: 0.5, fy: 0.9 });
    const after = await edited(before);
    expect(childNames(stackId())).toEqual(["h1", "Card", "Button", "Badge", "Stack"]);
    expect(after.split("\n").sort()).toEqual(before.split("\n").sort());
    expect(await page.getByTestId("selection-id").textContent()).toBe(badge);
  });

  it("moves across containers: from the row into the card", async () => {
    const row = idOf(stackId(), "Stack");
    const card = idOf(stackId(), "Card");
    const content = findNodeById(buildTree(homeFile()).roots, card)?.children.find((c) => c.name === "CardContent")?.id as string;
    const input = idOf(row, "Input");
    const before = homeFile();
    await moveOnCanvas(page, el(input), el(idOf(content, "Button")), { fx: 0.5, fy: 0.9 });
    await edited(before);
    expect(childNames(row)).toEqual(["Badge", "Button"]);
    expect(childNames(content)).toEqual(["p", "Button", "Input"]);
  });

  it("moves a locked .map block as a unit, verbatim", async () => {
    // The agent adds a list (written atomically, as an editor would).
    const block = `        {["alpha", "beta"].map((v) => (\n          <p key={v} data-ui-id="ui_mapr1">\n            {v}\n          </p>\n        ))}`;
    const source = homeFile().replace(/(\n\s*<\/Stack>\n\s*<\/Container>)/, `\n${block}$1`);
    const tmp = path.join(projectRoot, "src/pages/.HomePage.tsx.test.tmp");
    writeFileSync(tmp, source);
    renameSync(tmp, path.join(projectRoot, "src/pages/HomePage.tsx"));
    await waitForCanvas(page, sourceVersion(source));
    expect(childNames(stackId())).toEqual(["h1", "Card", "Button", "Badge", "Stack", "map"]);

    // Dragging a row grabs the whole block (rows are edited in place only).
    await moveOnCanvas(page, frame().getByText("beta"), el(idOf(stackId(), "Button")), { fx: 0.5, fy: 0.1 });
    const after = await edited(source);
    expect(childNames(stackId())).toEqual(["h1", "Card", "map", "Button", "Badge", "Stack"]);
    expect(after).toContain(block);
  });

  it("scrolls the page while a drag is held at the frame's edge", async () => {
    // Make the page taller than the canvas (as an agent's page would be).
    const tall = homeFile().replace(/(\n\s*<\/h1>)/, `$1\n        <div data-ui-id="ui_tall1" className="h-screen" />`);
    const tmp = path.join(projectRoot, "src/pages/.HomePage.tsx.test.tmp");
    writeFileSync(tmp, tall);
    renameSync(tmp, path.join(projectRoot, "src/pages/HomePage.tsx"));
    await waitForCanvas(page, sourceVersion(tall));
    // The block is now a screen below the heading; drag it up past the top edge.
    const row = frame().getByText("alpha");
    await row.evaluate((e) => e.scrollIntoView({ block: "end" }));
    const heading = frame().getByRole("heading", { name: "Compose" });
    expect(await heading.evaluate((h) => h.getBoundingClientRect().bottom < 0)).toBe(true);
    const from = await canvasPoint(page, "canvas-frame", row);
    const box = await page.getByTestId("canvas-frame").boundingBox();
    if (!box) throw new Error("no frame box");
    const before = homeFile();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 10, { steps: 2 });
    await page.mouse.move(from.x, box.y + 8, { steps: 8 });
    await expect.poll(() => heading.evaluate((h) => h.getBoundingClientRect().top >= 0), { timeout: 5_000 }).toBe(true);
    const to = await canvasPoint(page, "canvas-frame", heading, { fx: 0.5, fy: 0.2 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await edited(before);
    expect(childNames(stackId())).toEqual(["map", "h1", "div", "Card", "Button", "Badge", "Stack"]);
  });

  it("changes nothing when dropped where it was, or cancelled with Escape", async () => {
    const before = homeFile();
    const button = el(idOf(stackId(), "Button"));
    await moveOnCanvas(page, button, button, { fx: 0.5, fy: 0.3 });
    const from = await button.boundingBox();
    await button.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const box = await page.getByTestId("canvas-frame").boundingBox();
    if (!from || !box) throw new Error("no boxes");
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + 160, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(homeFile()).toBe(before);
    expect(await page.getByTestId("edit-error").count()).toBe(0);
  });
});

describe("delete (T3.4)", () => {
  const layer = (id: string) => page.getByTestId(`layer-${id}`);
  const idOf = (parent: string, name: string) => findNodeById(buildTree(homeFile()).roots, parent)?.children.find((c) => c.name === name)?.id as string;

  it("deletes layout Skeleton placed straight away, and selects the parent", async () => {
    expect(childNames(stackId())).toEqual(["map", "h1", "div", "Card", "Button", "Badge", "Stack"]);
    const badge = idOf(stackId(), "Badge");
    await layer(badge).click();
    const before = homeFile();
    await page.keyboard.press("Delete");
    const after = await edited(before);
    expect(childNames(stackId())).toEqual(["map", "h1", "div", "Card", "Button", "Stack"]);
    // Only the badge's line went.
    expect(before.split("\n").filter((l) => !after.split("\n").includes(l))).toEqual([expect.stringContaining(`data-ui-id="${badge}"`)]);
    await expect.poll(() => page.getByTestId("selection-id").textContent()).toBe(stackId());
  });

  it("won't delete an element a locked block wraps, and says why", async () => {
    await layer("ui_mapr1").click();
    const button = page.getByTestId("selection").getByRole("button", { name: "Delete" });
    expect(await button.isDisabled()).toBe(true);
    expect(await button.getAttribute("title")).toMatch(/inside 🔒 map/);
  });

  it("asks before deleting agent code, and Cancel leaves it", async () => {
    const mapRow = page.locator(".layer", { has: page.locator(".layer-name", { hasText: /^map$/ }) });
    await mapRow.click();
    const before = homeFile();
    await page.keyboard.press("Delete");
    const confirm = page.getByTestId("confirm-delete");
    await confirm.waitFor();
    expect(await confirm.textContent()).toContain("🔒 map (.map() loop)");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
    expect(homeFile()).toBe(before);

    await page.getByTestId("selection").getByRole("button", { name: "Delete" }).click();
    await confirm.getByRole("button", { name: "Delete anyway" }).click();
    const after = await edited(before);
    expect(after).not.toContain(".map(");
    expect(childNames(stackId())).toEqual(["h1", "div", "Card", "Button", "Stack"]);
  });

  it("takes Delete from the canvas too, when it has focus", async () => {
    const tall = canvasFrame(page).locator('[data-ui-id="ui_tall1"]');
    await tall.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const at = await canvasPoint(page, "canvas-frame", tall);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => page.getByTestId("selection-id").textContent()).toBe("ui_tall1");
    const before = homeFile();
    await page.keyboard.press("Delete");
    await edited(before);
    expect(childNames(stackId())).toEqual(["h1", "Card", "Button", "Stack"]);
  });
});

describe("properties panel (T3.5)", () => {
  const props = () => page.getByTestId("properties");
  const layer = (id: string) => page.getByTestId(`layer-${id}`);
  const idOf = (parent: string, name: string) => findNodeById(buildTree(homeFile()).roots, parent)?.children.find((c) => c.name === name)?.id as string;
  const lineOf = (id: string) => homeFile().split("\n").find((l) => l.includes(`data-ui-id="${id}"`)) ?? "";
  async function change(action: () => Promise<unknown>): Promise<string> {
    const before = homeFile();
    await action();
    const after = await edited(before);
    // Every property edit is one changed line.
    const removed = before.split("\n").filter((l) => !after.split("\n").includes(l));
    const added = after.split("\n").filter((l) => !before.split("\n").includes(l));
    expect([removed.length, added.length]).toEqual([1, 1]);
    return after;
  }

  it("sets a schema prop, and choosing the default removes it", async () => {
    const button = idOf(stackId(), "Button");
    await layer(button).click();
    await change(() => props().getByLabel("variant").selectOption("outline"));
    expect(lineOf(button)).toContain(`variant="outline"`);
    await change(() => props().getByLabel("size").selectOption("lg"));
    await change(() => props().getByLabel("disabled").click());
    expect(lineOf(button)).toMatch(/variant="outline" size="lg" disabled=\{true\}/);
    await change(() => props().getByLabel("variant").selectOption("default"));
    expect(lineOf(button)).not.toContain("variant=");
    await canvasFrame(page).locator(`button[data-ui-id="${button}"][disabled]`).waitFor();
  });

  it("edits text content, escaping what JSX would change", async () => {
    const button = idOf(stackId(), "Button");
    await layer(button).click();
    const text = props().getByLabel("Text");
    await change(async () => {
      await text.fill("Save & close");
      await text.press("Enter");
    });
    expect(lineOf(button)).toContain(`>{"Save & close"}</Button>`);
    await canvasFrame(page).getByRole("button", { name: "Save & close" }).waitFor();
  });

  it("edits Stack layout as classes, one group at a time", async () => {
    const row = idOf(stackId(), "Stack");
    await layer(row).click();
    expect(await props().getByLabel("direction").inputValue()).toBe("horizontal");
    expect(await props().getByLabel("Gap").inputValue()).toBe("gap-4");
    await change(() => props().getByLabel("Gap").selectOption("gap-8"));
    await change(() => props().getByLabel("Justify").selectOption("justify-between"));
    await change(() => props().getByLabel("Align").selectOption("items-center"));
    // A swap stays in place; a new group's class goes at the end.
    expect(lineOf(row)).toContain(`className="gap-8 p-4 justify-between items-center"`);
    await change(() => props().getByLabel("Justify").selectOption(""));
    expect(lineOf(row)).toContain(`className="gap-8 p-4 items-center"`);
    await change(() => props().getByLabel("direction").selectOption("vertical"));
    expect(lineOf(row)).not.toContain("direction=");
    // The canvas shows it: a column now, with the new gap.
    const style = await canvasFrame(page).locator(`[data-ui-id="${row}"]`).evaluate((e) => [getComputedStyle(e).flexDirection, getComputedStyle(e).rowGap]);
    expect(style).toEqual(["column", "32px"]);
  });

  it("keeps editing literal props on an element with agent logic", async () => {
    const before = homeFile();
    const button = idOf(stackId(), "Button");
    const source = before.replace(`<Button data-ui-id="${button}"`, `<Button data-ui-id="${button}" onClick={() => alert("hi")}`);
    const tmp = path.join(projectRoot, "src/pages/.HomePage.tsx.test.tmp");
    writeFileSync(tmp, source);
    renameSync(tmp, path.join(projectRoot, "src/pages/HomePage.tsx"));
    await waitForCanvas(page, sourceVersion(source));
    await layer(button).click();
    expect(await props().getByLabel("variant").count()).toBe(1);
    expect(await page.getByTestId("selection").textContent()).toContain("onClick");
  });
});

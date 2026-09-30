// Phase 3 (composition) on a freshly scaffolded project: the palette, placing,
// moving and removing elements, and the properties panel. Gate 3 lives in gate3.test.ts.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildTree, findNodeById, parseModule } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, placeFromPalette } from "./canvas-click.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-compose-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "compose");
const homeFile = () => readFileSync(path.join(projectRoot, "src/pages/HomePage.tsx"), "utf8");
const stackId = () => /<Stack data-ui-id="(ui_[a-z0-9]{5})"/.exec(homeFile())?.[1] as string;
const childNames = (id: string) => findNodeById(buildTree(homeFile()).roots, id)?.children.map((c) => c.name) ?? [];

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

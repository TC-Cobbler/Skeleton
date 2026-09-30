// Phase 3 (composition) on a freshly scaffolded project: the palette, placing,
// moving and removing elements, and the properties panel. Gate 3 lives in gate3.test.ts.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-compose-"));

let app: ElectronApplication;
let page: Page;

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

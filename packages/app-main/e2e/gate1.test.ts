// Gate 1 (PRD F1): new project → running app on screen in under 30 s, measured from
// clicking "Create project" to the new app's home page rendering its heading on
// Skeleton's canvas.
//
// GATE1_COLD=1 uses an empty pnpm store, so every package is downloaded.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication } from "playwright-core";
import { afterAll, describe, expect, it } from "vitest";
import { ui } from "./ui.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-gate1-"));
const cold = process.env["GATE1_COLD"] === "1";

let app: ElectronApplication | undefined;
afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe(`Gate 1 (${cold ? "cold" : "warm"} pnpm store)`, () => {
  it("new project → running app on screen in under 30 s", async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
      ),
    );
    app = await _electron.launch({
      args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
      cwd: pkgRoot,
      env: {
        ...env,
        SKELETON_USER_DATA: path.join(scratch, "profile"),
        ...(cold ? { npm_config_store_dir: path.join(scratch, "empty-store") } : {}),
      },
    });
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, scratch);
    await ui(page).picker.changeFolder().click();
    await ui(page).picker.projectName().fill("Gate One");

    const started = Date.now();
    await ui(page).picker.create().click();
    await page.getByTestId("project-root").waitFor({ timeout: 60_000 });
    const created = Date.now();
    await page.getByTestId("devserver-url").waitFor({ timeout: 60_000 });
    const serving = Date.now();
    const url = (await page.getByTestId("devserver-url").textContent()) ?? "";

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    await page
      .frameLocator('[data-testid="canvas-frame"]')
      .getByRole("heading", { name: "Gate One" })
      .waitFor({ timeout: 60_000 });
    const onScreen = Date.now();

    const total = onScreen - started;
    console.log(
      `Gate 1 (${cold ? "cold" : "warm"}): scaffold+install+commit ${created - started} ms, ` +
        `dev server ${serving - created} ms, first render ${onScreen - serving} ms, total ${total} ms`,
    );
    expect(total).toBeLessThan(30_000);
  }, 180_000);
});

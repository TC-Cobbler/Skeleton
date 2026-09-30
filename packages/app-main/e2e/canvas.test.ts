// Canvas on a real post-agent project (fixtures/post-agent/loop-02): locked blocks,
// view source, and selection inside agent-written code.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Frame, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(tmpdir(), "skeleton-canvas-"));
const projectRoot = path.join(work, "loop-02");

let app: ElectronApplication;
let page: Page;
let frame: () => Frame;

beforeAll(async () => {
  cpSync(path.resolve(pkgRoot, "../../fixtures/post-agent/loop-02"), projectRoot, { recursive: true });
  execFileSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-workspace"], { cwd: projectRoot, stdio: "pipe" });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: pkgRoot,
    env: { ...env, SKELETON_USER_DATA: path.join(work, "profile") },
  });
  page = await app.firstWindow();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, projectRoot);
  await page.getByRole("button", { name: "Open…" }).click();
  await page.frameLocator('[data-testid="canvas-frame"]').getByRole("heading", { name: "Orders" }).waitFor({ timeout: 60_000 });
  frame = () => {
    const f = page.frames().find((fr) => fr.url().startsWith("http://127.0.0.1:"));
    if (!f) throw new Error("canvas frame not found");
    return f;
  };
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(work, { recursive: true, force: true });
});

const overlayHtml = () => frame().evaluate(() => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "");

describe("locked blocks on the canvas (T2.4)", () => {
  it("outlines and labels every rendered locked block", async () => {
    await expect.poll(overlayHtml).toContain("🔒 NewOrderDialog #ui_hskdg");
    const html = await overlayHtml();
    expect(html).toContain("🔒 .map()");
    expect(html).toContain("🔒 conditional");
    expect(html).toMatch(/border:1px dashed #ea580c/);
  });

  it("hides the markers in interact mode", async () => {
    await page.getByRole("button", { name: "Select mode" }).click();
    await expect.poll(overlayHtml).not.toContain("🔒");
    await page.getByRole("button", { name: "Interact mode" }).click();
    await expect.poll(overlayHtml).toContain("🔒");
  });

  it("shows a locked block's exact source, read-only", async () => {
    await page.getByTestId("layer-ui_hskdg").click();
    expect(await page.getByTestId("selection-lock").textContent()).toBe("custom component");
    await page.getByRole("button", { name: "View source" }).click();
    const code = (await page.getByTestId("view-source-code").textContent()) ?? "";
    const file = readFileSync(path.join(projectRoot, "src/pages/HomePage.tsx"), "utf8");
    expect(code).toContain("NewOrderDialog");
    expect(code).toContain('data-ui-id="ui_new0r"');
    expect(file).toContain("</NewOrderDialog>");
    await page.getByRole("button", { name: "Hide source" }).click();
  });

  it("selects agent-rendered elements through the locked .map (editable in place)", async () => {
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    await canvas.getByRole("cell").first().click();
    await expect.poll(() => page.getByTestId("selection-name").textContent()).toMatch(/^Table(Cell|Row)$/);
    expect(await page.getByTestId("selection-kind").textContent()).toBe("palette");
  });
});

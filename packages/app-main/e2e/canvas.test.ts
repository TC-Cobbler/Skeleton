// Canvas on a real post-agent project (fixtures/post-agent/loop-02): locked blocks,
// view source, and selection inside agent-written code.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Frame, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clickOnCanvas } from "./canvas-click.js";

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
    await clickOnCanvas(page, "canvas-frame", canvas.getByRole("cell").first());
    await expect.poll(() => page.getByTestId("selection-name").textContent()).toMatch(/^Table(Cell|Row)$/);
    expect(await page.getByTestId("selection-kind").textContent()).toBe("palette");
  });
});

describe("preview widths (T2.7)", () => {
  const frameWidth = (id: string) => page.getByTestId(id).evaluate((el) => (el as HTMLIFrameElement).style.width);

  it("switches between desktop, tablet and mobile", async () => {
    expect(await frameWidth("canvas-frame")).toBe("1280px");
    await page.getByRole("button", { name: "Tablet" }).click();
    await expect.poll(() => frameWidth("canvas-frame")).toBe("768px");
    await page.getByRole("button", { name: "Mobile" }).click();
    await expect.poll(() => frameWidth("canvas-frame")).toBe("390px");
    const inner = await page.frameLocator('[data-testid="canvas-frame"]').locator("body").evaluate(() => window.innerWidth);
    expect(inner).toBe(390);
  });

  it("shows all three side by side at one scale, with selection shared", async () => {
    await page.getByRole("button", { name: "Side by side" }).click();
    await page.getByTestId("canvas-frame-mobile").waitFor();
    await page.getByTestId("canvas-frame-tablet").waitFor();
    const scales = await page
      .locator(".frame iframe")
      .evaluateAll((els) => els.map((el) => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1])));
    expect(scales).toHaveLength(3);
    for (const scale of scales) expect(scale).toBeCloseTo(scales[0] as number, 2);

    const mobile = page.frameLocator('[data-testid="canvas-frame-mobile"]');
    await mobile.getByRole("button", { name: "Export" }).waitFor({ timeout: 20_000 });
    await clickOnCanvas(page, "canvas-frame-mobile", mobile.getByRole("button", { name: "Export" }));
    await expect.poll(() => page.getByTestId("selection-id").textContent()).toBe("ui_exp0r");
    for (const id of ["canvas-frame", "canvas-frame-tablet", "canvas-frame-mobile"]) {
      const html = () =>
        page.frameLocator(`[data-testid="${id}"]`).locator("skeleton-overlay").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
      await expect.poll(html).toContain("Button #ui_exp0r");
    }
    await page.getByRole("button", { name: "Desktop" }).click();
    await expect.poll(() => page.locator(".frame iframe").count()).toBe(1);
  }, 60_000);
});

describe("light/dark toggle (T2.8)", () => {
  it("sets .dark on the previewed document and the app's dark tokens apply", async () => {
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    const html = canvas.locator("html");
    const bg = () => canvas.locator("body").evaluate((b) => getComputedStyle(b).backgroundColor);
    const light = await bg();
    await page.getByRole("button", { name: "Dark" }).click();
    await expect.poll(() => html.getAttribute("class")).toContain("dark");
    await expect.poll(bg).not.toBe(light);
    // Survives a reload of the app (sent again when the overlay reconnects).
    await page.getByRole("listbox", { name: "Pages list" }).getByRole("option").first().click();
    await expect.poll(() => html.getAttribute("class")).toContain("dark");
    await page.getByRole("button", { name: "Light" }).click();
    await expect.poll(() => html.getAttribute("class")).not.toContain("dark");
    await expect.poll(bg).toBe(light);
  });
});

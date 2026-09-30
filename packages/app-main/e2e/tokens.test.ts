// Phase 4 (tokens and gizmos) on a freshly scaffolded project. Gate 4 lives in gate4.test.ts.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { readTokens } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, placeFromPalette } from "./canvas-click.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-tokens-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "tokens");
const css = () => readFileSync(path.join(projectRoot, "src/styles/globals.css"), "utf8");
const token = (name: string, block: "light" | "dark" | "theme" | "theme-inline" = "theme-inline") =>
  readTokens(css()).find((t) => t.name === name && t.block === block)?.value;
const frame = () => canvasFrame(page);
/** The computed style of the first element matching `selector` in the canvas. */
const styleOf = (selector: string, prop: string) =>
  frame()
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

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
  await page.getByLabel("Project name").fill("Tokens");
  await page.getByRole("button", { name: "Create project" }).click();
  await frame().getByRole("heading", { name: "Tokens" }).waitFor({ timeout: 90_000 });
  await placeFromPalette(page, "button", frame().getByRole("heading", { name: "Tokens" }), { fx: 0.5, fy: 0.9 });
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("token panel (T4.1)", () => {
  const panel = () => page.getByRole("region", { name: "Tokens" });
  const row = (name: string) => panel().getByTestId(`token-${name}`);

  it("lists every token by group, colours with light and dark side by side", async () => {
    await page.getByRole("tab", { name: "Tokens" }).click();
    await row("--radius").waitFor();
    for (const name of ["--radius", "--radius-button", "--spacing", "--type-base", "--text-lg", "--font-sans", "--primary", "--border-width"]) {
      expect(await row(name).count(), name).toBe(1);
    }
    expect(await row("--primary").getByLabel("--primary value").inputValue()).toBe("oklch(0.205 0 0)");
    expect(await row("--primary").getByLabel("--primary dark value").inputValue()).toBe("oklch(0.922 0 0)");
    expect(await row("--radius-button").textContent()).toContain("= 0.5rem");
  });

  it("writes an exact value to globals.css, and the canvas follows", async () => {
    const input = row("--radius").getByLabel("--radius value");
    await input.fill("1rem");
    await input.press("Enter");
    await expect.poll(() => token("--radius", "light")).toBe("1rem");
    // The Button's radius is derived: 1rem * 0.8 = 12.8px.
    await expect.poll(() => styleOf("button", "border-top-left-radius"), { timeout: 10_000 }).toBe("12.8px");
    await expect.poll(() => row("--radius-button").textContent()).toContain("= 0.8rem");
  });

  it("detaches a derived token to its value, and re-attaches it to the formula", async () => {
    await row("--radius-button").getByRole("button", { name: "Detach" }).click();
    await expect.poll(() => token("--radius-button")).toBe("0.8rem");
    await row("--radius-button").getByRole("button", { name: "Attach" }).click();
    await expect.poll(() => token("--radius-button")).toBe("calc(var(--radius) * 0.8)");
  });

  it("writes a dark value to .dark only", async () => {
    const input = row("--primary").getByLabel("--primary dark value");
    await input.fill("oklch(0.7 0.15 250)");
    await input.press("Enter");
    await expect.poll(() => token("--primary", "dark")).toBe("oklch(0.7 0.15 250)");
    expect(token("--primary", "light")).toBe("oklch(0.205 0 0)");
  });

  it("undoes a token write", async () => {
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => token("--primary", "dark")).toBe("oklch(0.922 0 0)");
  });
});

describe("token-to-element map (T4.2)", () => {
  const panel = () => page.getByRole("region", { name: "Tokens" });
  const count = (name: string) => panel().getByTestId(`token-${name}`).getByTestId("token-count").textContent();
  const tokenBoxes = () =>
    frame()
      .locator("skeleton-overlay")
      .evaluate((el) => el.shadowRoot?.querySelectorAll("[data-token-box]").length ?? 0);

  it("counts the elements each token affects on the page, live", async () => {
    await expect.poll(() => count("--radius-button")).toBe("1");
    expect(Number(await count("--radius"))).toBeGreaterThanOrEqual(1);
    expect(Number(await count("--background"))).toBeGreaterThanOrEqual(1); // body
    await page.getByRole("tab", { name: "Element" }).click();
    await placeFromPalette(page, "button", frame().getByRole("heading", { name: "Tokens" }), { fx: 0.5, fy: 0.9 });
    await page.getByRole("tab", { name: "Tokens" }).click();
    await expect.poll(() => count("--radius-button")).toBe("2");
  });

  it("outlines what a token affects while its row is hovered", async () => {
    await panel().getByTestId("token---radius-button").hover();
    await expect.poll(tokenBoxes).toBe(2);
    await panel().getByRole("heading", { name: "Tokens" }).hover();
    await expect.poll(tokenBoxes).toBe(0);
  });
});

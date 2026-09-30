import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron,
  type ElectronApplication,
  type Page,
} from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.resolve(pkgRoot, "../../fixtures/base");

let app: ElectronApplication;
let page: Page;

beforeAll(async () => {
  // Load the built renderer, not a dev server.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: pkgRoot,
    env,
  });
  page = await app.firstWindow();
});

afterAll(async () => {
  await app?.close();
});

describe("Electron shell", () => {
  it("renders the React renderer with info from main", async () => {
    await expect(page.getByTestId("app-info").textContent()).resolves.toMatch(
      /Electron \d+/,
    );
  });

  it("gives the renderer no Node access", async () => {
    const globals = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)["require"],
      process: typeof (globalThis as Record<string, unknown>)["process"],
      bridge: Object.keys(window.skeleton),
    }));
    expect(globals).toEqual({
      require: "undefined",
      process: "undefined",
      bridge: ["invoke"],
    });
  });

  it("parses a page through main and core", async () => {
    const result = await page.evaluate(
      (root) =>
        window.skeleton.invoke("page:tree", {
          projectRoot: root,
          file: "src/pages/HomePage.tsx",
        }),
      fixtureRoot,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses channels outside the contract", async () => {
    const result = await page.evaluate(() =>
      (window.skeleton.invoke as (c: string, r: unknown) => Promise<unknown>)(
        "fs:readFile",
        "/etc/passwd",
      ),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "bad-request" } });
  });

  it("shows the parsed tree in the UI", async () => {
    await page.getByLabel("Project root").fill(fixtureRoot);
    await page.getByRole("button", { name: "Open" }).click();
    await page.getByRole("button", { name: "Parse" }).click();
    await expect(
      page.locator(".tree li").first().textContent(),
    ).resolves.toMatch(/\w/);
  });
});

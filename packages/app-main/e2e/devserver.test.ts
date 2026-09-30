import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parentDir = mkdtempSync(path.join(tmpdir(), "skeleton-e2e-"));

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
    env,
  });
  page = await app.firstWindow();
});

afterAll(async () => {
  await app?.close();
  rmSync(parentDir, { recursive: true, force: true });
});

describe("create a project and run its dev server", () => {
  let projectRoot = "";
  let url = "";

  it("scaffolds a project through main", async () => {
    const result = await page.evaluate(
      (dir) => window.skeleton.invoke("project:create", { parentDir: dir, name: "E2E App" }),
      parentDir,
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    projectRoot = result.value.projectRoot;
    expect(projectRoot).toBe(path.join(parentDir, "e2e-app"));
  }, 120_000);

  it("starts Vite from the panel and shows its URL and log", async () => {
    await page.getByLabel("Project root").fill(projectRoot);
    await page.getByRole("button", { name: "Open" }).click();
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
    expect(await page.getByTestId("devserver-state").textContent()).toBe("running");
    url = (await page.getByTestId("devserver-url").textContent()) ?? "";
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await page.getByTestId("devserver-log").textContent()).toMatch(/ready in/);
    const html = await (await fetch(url)).text();
    expect(html).toContain("<title>E2E App</title>");
  }, 60_000);

  it("stops Vite from the panel", async () => {
    await page.getByRole("button", { name: "Stop" }).click();
    await page.getByText("stopped", { exact: true }).waitFor({ timeout: 10_000 });
    await expect(fetch(url)).rejects.toThrow();
  });

  it("stops running dev servers when the app quits", async () => {
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
    const second = (await page.getByTestId("devserver-url").textContent()) ?? "";
    await (await fetch(second)).text();
    await app.close();
    await expect(fetch(second)).rejects.toThrow();
  }, 60_000);
});

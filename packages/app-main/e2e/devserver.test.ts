import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parentDir = mkdtempSync(path.join(tmpdir(), "skeleton-e2e-"));
const userData = mkdtempSync(path.join(tmpdir(), "skeleton-e2e-profile-"));

let app: ElectronApplication;
let page: Page;

async function launch() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: pkgRoot,
    env: { ...env, SKELETON_USER_DATA: userData },
  });
  page = await app.firstWindow();
}

/** Replace the native folder dialog so the test can "choose" a folder. */
async function stubFolderDialog(folder: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
  }, folder);
}

beforeAll(launch);

afterAll(async () => {
  await app?.close();
  rmSync(parentDir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

describe("new project → running dev server (PRD F1)", () => {
  const projectRoot = path.join(parentDir, "e2e-app");
  let url = "";

  it("creates a project from the picker and starts its dev server", async () => {
    await stubFolderDialog(parentDir);
    await page.getByRole("button", { name: "Change…" }).click();
    await expect(page.getByTestId("parent-dir").textContent()).resolves.toBe(`in ${parentDir}`);
    await page.getByLabel("Project name").fill("E2E App");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByTestId("project-root").waitFor({ timeout: 120_000 });
    expect(await page.getByTestId("project-root").textContent()).toBe(projectRoot);

    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
    expect(await page.getByTestId("devserver-state").textContent()).toBe("running");
    url = (await page.getByTestId("devserver-url").textContent()) ?? "";
    expect(await (await fetch(url)).text()).toContain("<title>E2E App</title>");
  }, 180_000);

  it("shows the running app on the canvas (T2.1)", async () => {
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    await canvas.getByRole("heading", { name: "E2E App" }).waitFor({ timeout: 30_000 });
    expect(await page.getByTestId("canvas-frame").getAttribute("src")).toBe(url);
    // The embedded app has no bridge into main.
    const frame = page.frames().find((f) => f.url().startsWith(url));
    expect(await frame?.evaluate(() => typeof (window as unknown as { skeleton?: unknown }).skeleton)).toBe("undefined");
  }, 60_000);

  it("closing the project stops its server and lists it as recent", async () => {
    await page.getByRole("button", { name: "Close project" }).click();
    await page.getByRole("heading", { name: "New project" }).waitFor();
    await expect(fetch(url)).rejects.toThrow();
    const recent = page.getByRole("list", { name: "Recent projects" });
    expect(await recent.textContent()).toContain("E2E App");
  });

  it("reopens from the recent list", async () => {
    await page.getByRole("button", { name: /^E2E App/ }).click();
    expect(await page.getByTestId("project-root").textContent()).toBe(projectRoot);
    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
  }, 60_000);

  it("stops running dev servers when the app quits, and remembers recents", async () => {
    const running = (await page.getByTestId("devserver-url").textContent()) ?? "";
    await app.close();
    await expect(fetch(running)).rejects.toThrow();
    await launch();
    const recent = page.getByRole("list", { name: "Recent projects" });
    await recent.getByText("E2E App").waitFor();
  }, 60_000);

  it("refuses to open a folder that isn't a Skeleton project", async () => {
    await stubFolderDialog(parentDir);
    await page.getByRole("button", { name: "Open…" }).click();
    await page.getByText(/isn't a Skeleton project/).waitFor();
  });
});

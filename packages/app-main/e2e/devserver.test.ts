import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clickOnCanvas } from "./canvas-click.js";
import { copy, ui } from "./ui.js";

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
    await ui(page).picker.changeFolder().click();
    // The dialog answers asynchronously: wait for the label, don't read it once.
    await expect.poll(() => page.getByTestId("parent-dir").textContent()).toBe(copy.picker.inFolder(parentDir));
    await ui(page).picker.projectName().fill("E2E App");
    await ui(page).picker.create().click();
    await page.getByTestId("project-root").waitFor({ timeout: 120_000 });
    expect(await page.getByTestId("project-root").textContent()).toBe(projectRoot);

    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
    expect(await page.getByTestId("devserver-state").textContent()).toBe(copy.devServer.state("running"));
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

  it("selects elements on the canvas through the overlay (T2.2)", async () => {
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    const heading = canvas.getByRole("heading", { name: "E2E App" });
    await clickOnCanvas(page, "canvas-frame", heading);
    await page.getByTestId("selection-id").waitFor();
    expect(await page.getByTestId("selection-name").textContent()).toBe("h1");
    expect(await page.getByTestId("selection-id").textContent()).toMatch(/^ui_[a-z0-9]{5}$/);
    const id = await page.getByTestId("selection-id").textContent();
    const tagged = await heading.getAttribute("data-ui-id");
    expect(tagged).toBe(id);
    expect(await heading.getAttribute("data-skeleton-loc")).toMatch(/^src\/pages\/HomePage\.tsx:\d+@[0-9a-f]{14}$/);

    // Interact mode hands clicks back to the app: no selection change.
    await ui(page).selectMode().click();
    await ui(page).interactMode().waitFor();
    await clickOnCanvas(page, "canvas-frame", heading);
    expect(await page.getByTestId("selection-id").textContent()).toBe(id);
    await ui(page).interactMode().click();
  }, 60_000);

  it("re-parses after an edit on disk and keeps the selection mapped (HMR)", async () => {
    const file = path.join(projectRoot, "src/pages/HomePage.tsx");
    const source = readFileSync(file, "utf8");
    writeFileSync(file, source.replace("E2E App", "E2E App, edited"));
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    await canvas.getByRole("heading", { name: "E2E App, edited" }).waitFor({ timeout: 15_000 });
    await clickOnCanvas(page, "canvas-frame", canvas.getByRole("heading", { name: "E2E App, edited" }));
    expect(await page.getByTestId("selection-name").textContent()).toBe("h1");
    writeFileSync(file, source);
    await canvas.getByRole("heading", { name: "E2E App", exact: true }).waitFor({ timeout: 15_000 });
  }, 60_000);

  it("syncs selection between the layers tree and the canvas (T2.3)", async () => {
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    const tree = ui(page).layersTree();
    const rows = tree.getByRole("treeitem");
    expect(await rows.count()).toBe(3); // Container > Stack > h1

    // Tree → canvas: the overlay outlines the element with its label.
    await rows.nth(1).click();
    expect(await page.getByTestId("selection-name").textContent()).toBe("Stack");
    const shadow = () => page.frames().find((f) => f.url().startsWith(url))?.evaluate(() => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "");
    await expect.poll(shadow).toContain("Stack #ui_");

    // Canvas → tree: clicking the heading selects its row.
    await clickOnCanvas(page, "canvas-frame", canvas.getByRole("heading", { name: "E2E App" }));
    await expect.poll(() => rows.nth(2).getAttribute("aria-selected")).toBe("true");
    expect(await rows.nth(1).getAttribute("aria-selected")).toBe("false");
  }, 60_000);

  it("keeps the selection on the same element when an edit shifts the tree", async () => {
    const file = path.join(projectRoot, "src/pages/HomePage.tsx");
    const source = readFileSync(file, "utf8");
    const headingId = await page.getByTestId("selection-id").textContent();
    writeFileSync(file, source.replace('<h1 data-ui-id', '<p data-ui-id="ui_zzzzz">Intro</p>\n        <h1 data-ui-id'));
    const rows = ui(page).layersTree().getByRole("treeitem");
    await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(4);
    expect(await page.getByTestId("selection-id").textContent()).toBe(headingId);
    expect(await rows.nth(3).getAttribute("aria-selected")).toBe("true");
    writeFileSync(file, source);
    await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(3);
  }, 60_000);

  it("lists pages from the router and navigates between them (T2.5)", async () => {
    writeFileSync(
      path.join(projectRoot, "src/pages/OrdersPage.tsx"),
      `import { Stack } from "@/components/layout";

export default function OrdersPage() {
  return (
    <Stack data-ui-id="ui_ord01" className="gap-4 p-8">
      <h2 data-ui-id="ui_ord02">Orders page</h2>
    </Stack>
  );
}
`,
    );
    const router = path.join(projectRoot, "src/router.tsx");
    const original = readFileSync(router, "utf8");
    writeFileSync(
      router,
      original
        .replace('import HomePage from "./pages/HomePage";', 'import HomePage from "./pages/HomePage";\nimport OrdersPage from "./pages/OrdersPage";')
        .replace('{ path: "/", element: <HomePage /> },', '{ path: "/", element: <HomePage /> },\n  { path: "/orders", element: <OrdersPage /> },'),
    );
    const list = ui(page).pagesList();
    await list.getByRole("option", { name: /\/orders/ }).waitFor({ timeout: 15_000 });
    expect(await list.getByRole("option", { name: /^\/ HomePage/ }).getAttribute("aria-selected")).toBe("true");

    await list.getByRole("option", { name: /\/orders/ }).click();
    const canvas = page.frameLocator('[data-testid="canvas-frame"]');
    await canvas.getByRole("heading", { name: "Orders page" }).waitFor({ timeout: 15_000 });
    await page.getByTestId("layer-ui_ord02").waitFor();
    expect(await list.getByRole("option", { name: /\/orders/ }).getAttribute("aria-selected")).toBe("true");

    // Navigating inside the app switches the page too.
    const frame = page.frames().find((f) => f.url().startsWith(url));
    await frame?.evaluate(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await canvas.getByRole("heading", { name: "E2E App" }).waitFor({ timeout: 15_000 });
    await expect.poll(() => list.getByRole("option", { name: /^\/ HomePage/ }).getAttribute("aria-selected")).toBe("true");
    await expect.poll(() => page.getByTestId("layer-ui_ord02").count()).toBe(0);
  }, 60_000);

  it("re-parses external changes even with the dev server stopped (T2.6)", async () => {
    await ui(page).devServer.stop().click();
    await page.getByTestId("canvas-empty").waitFor();
    const file = path.join(projectRoot, "src/pages/HomePage.tsx");
    const source = readFileSync(file, "utf8");
    writeFileSync(file, source.replace('<h1 data-ui-id', '<p data-ui-id="ui_ext01">From outside</p>\n        <h1 data-ui-id'));
    await page.getByTestId("layer-ui_ext01").waitFor({ timeout: 10_000 });
    writeFileSync(file, source);
    await expect.poll(() => page.getByTestId("layer-ui_ext01").count(), { timeout: 10_000 }).toBe(0);
    await ui(page).devServer.start().click();
    await page.getByTestId("devserver-url").waitFor({ timeout: 30_000 });
    url = (await page.getByTestId("devserver-url").textContent()) ?? "";
  }, 60_000);

  it("closing the project stops its server and lists it as recent", async () => {
    await ui(page).closeProject().click();
    await ui(page).picker.newProject().waitFor();
    await expect(fetch(url)).rejects.toThrow();
    const recent = ui(page).picker.recent();
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
    const recent = ui(page).picker.recent();
    await recent.getByText("E2E App").waitFor();
  }, 60_000);

  it("refuses to open a folder that isn't a Skeleton project", async () => {
    await stubFolderDialog(parentDir);
    await ui(page).picker.openFolder().click();
    await page.getByText(/isn't a Skeleton project/).waitFor();
  });
});

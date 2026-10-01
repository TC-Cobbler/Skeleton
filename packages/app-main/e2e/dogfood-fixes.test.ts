// v1.0.x: the dogfood's friction fixes (ROADMAP.md, docs/dogfood-log.md F-1 to F-6), on a
// newly created project, with the real mouse and keyboard.
//
// - F-1, F-4: aimed at a container's edge, a drop goes beside it, not into it (T7.1).
// - F-2: Move up / Move down, from the Selection panel and Alt+↑/↓ (T7.2).
// - F-3: Skeleton's chrome doesn't select its own text; the log still does (T7.3).
// - F-6: "Open in canvas" opens a Dialog by its trigger, to compose inside it (T7.4).
// - F-5: a double-click edits an element's text on the canvas (T7.5).

import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright-core";
import { buildTree, findNodeById, sourceVersion } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, canvasPoint, placeFromPalette, waitForCanvas } from "./canvas-click.js";
import { copy, ui } from "./ui.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-fixes-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "fixes");
const HOME = "src/pages/HomePage.tsx";
const homeFile = () => readFileSync(path.join(projectRoot, HOME), "utf8");
const frame = () => canvasFrame(page);
const el = (id: string) => frame().locator(`[data-ui-id="${id}"]`).first();
const childNames = (id: string) => findNodeById(buildTree(homeFile()).roots, id)?.children.map((c) => c.name) ?? [];
const childIds = (id: string) => findNodeById(buildTree(homeFile()).roots, id)?.children.map((c) => c.id) ?? [];
let pageStack = "";

const IDS = { toolbar: "ui_tool0", search: "ui_srch0", grid: "ui_grid0", card: "ui_card1", title: "ui_ct001", dialog: "ui_dlg00", content: "ui_dct00" };

/** Waits for the file to change from `before`, then for the canvas to show and map it. */
async function edited(before: string): Promise<string> {
  await expect.poll(homeFile, { timeout: 10_000 }).not.toBe(before);
  const after = homeFile();
  await waitForCanvas(page, sourceVersion(after));
  return after;
}

/** An aim `px` pixels inside one edge of the element (the canvas frame isn't scaled at the default size). */
async function edge(target: Locator, side: "right" | "bottom", px: number): Promise<{ fx: number; fy: number }> {
  const box = await target.evaluate((e) => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
  return side === "right" ? { fx: 1 - px / box.width, fy: 0.5 } : { fx: 0.5, fy: 1 - px / box.height };
}

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
  await ui(page).picker.changeFolder().click();
  await ui(page).picker.projectName().fill("Fixes");
  await ui(page).picker.create().click();
  await frame().getByRole("heading", { name: "Fixes" }).waitFor({ timeout: 90_000 });
  // A toolbar, a Grid with one Card, and a closed Dialog: what the dogfood's loops composed.
  const source = homeFile()
    .replace(
      'import { Container, Stack } from "@/components/layout";',
      [
        'import { Container, Grid, Stack } from "@/components/layout";',
        'import { Button } from "@/components/ui/button";',
        'import { Card, CardHeader, CardTitle } from "@/components/ui/card";',
        'import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";',
        'import { Input } from "@/components/ui/input";',
      ].join("\n"),
    )
    .replace(
      "        </h1>\n",
      [
        "        </h1>",
        `        <Stack data-ui-id="${IDS.toolbar}" direction="horizontal" className="gap-4">`,
        `          <Input data-ui-id="${IDS.search}" placeholder="Search" />`,
        `          <Button data-ui-id="ui_add00">Add</Button>`,
        "        </Stack>",
        `        <Grid data-ui-id="${IDS.grid}" className="grid-cols-3 gap-4">`,
        `          <Card data-ui-id="${IDS.card}">`,
        `            <CardHeader data-ui-id="ui_ch001">`,
        `              <CardTitle data-ui-id="${IDS.title}">Card title</CardTitle>`,
        "            </CardHeader>",
        "          </Card>",
        "        </Grid>",
        `        <Dialog data-ui-id="${IDS.dialog}">`,
        `          <DialogTrigger data-ui-id="ui_dtr00" asChild>`,
        `            <Button data-ui-id="ui_dbt00" variant="outline">Add game</Button>`,
        "          </DialogTrigger>",
        `          <DialogContent data-ui-id="${IDS.content}">`,
        `            <DialogHeader data-ui-id="ui_dhd00">`,
        `              <DialogTitle data-ui-id="ui_dtt00">New game</DialogTitle>`,
        "            </DialogHeader>",
        "          </DialogContent>",
        "        </Dialog>",
        "",
      ].join("\n"),
    );
  const tmp = path.join(projectRoot, "src/pages/.HomePage.tsx.test.tmp");
  writeFileSync(tmp, source);
  renameSync(tmp, path.join(projectRoot, HOME));
  await waitForCanvas(page, sourceVersion(source));
  pageStack = /<Stack data-ui-id="(ui_[a-z0-9]{5})" className="gap-6/.exec(source)?.[1] as string;
  await ui(page).showLayers();
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("drop beside a container (T7.1, F-1, F-4)", () => {
  it("F-4: a Card aimed at the right edge of a Card in a Grid goes beside it, not inside", async () => {
    const before = childNames(IDS.card);
    const id = await placeFromPalette(page, "card", el(IDS.card), await edge(el(IDS.card), "right", 3));
    expect(childIds(IDS.grid)).toEqual([IDS.card, id]);
    expect(childNames(IDS.card)).toEqual(before);
  });

  it("F-1: a Badge aimed at the bottom edge of the toolbar goes below it, not into the row", async () => {
    // The pointer is over the search box: the toolbar's children fill its height.
    const id = await placeFromPalette(page, "badge", el(IDS.search), await edge(el(IDS.toolbar), "bottom", 3));
    expect(childIds(pageStack)).toEqual([expect.any(String), IDS.toolbar, id, IDS.grid, IDS.dialog]);
    expect(childNames(IDS.toolbar)).toEqual(["Input", "Button"]);
  });

  it("still drops into a container aimed at its middle", async () => {
    await placeFromPalette(page, "button", el(IDS.toolbar), { fx: 0.98, fy: 0.5 });
    expect(childNames(IDS.toolbar)).toEqual(["Input", "Button", "Button"]);
  });
});

describe("Move up / Move down (T7.2, F-2)", () => {
  const selection = () => page.getByTestId("selection");

  it("moves the selection one place among its siblings, from the panel and the keyboard", async () => {
    const badge = childIds(pageStack)[2] as string;
    await page.getByTestId(`layer-${badge}`).click();
    let before = homeFile();
    await selection().getByTestId("move-up").click();
    await edited(before);
    expect(childIds(pageStack).slice(1, 3)).toEqual([badge, IDS.toolbar]);
    // Only the badge's line moved.
    expect(homeFile().split("\n").sort()).toEqual(before.split("\n").sort());

    before = homeFile();
    await page.getByTestId(`layer-${badge}`).click();
    await page.keyboard.press("Alt+ArrowDown");
    await edited(before);
    expect(childIds(pageStack).slice(1, 3)).toEqual([IDS.toolbar, badge]);
  });

  it("is off at the ends, and says why", async () => {
    await page.getByTestId(`layer-${IDS.dialog}`).click();
    const down = selection().getByTestId("move-down");
    expect(await down.isDisabled()).toBe(true);
    expect(await down.getAttribute("aria-description")).toBe(copy.nodes.last);
    expect(await selection().getByTestId("move-up").isDisabled()).toBe(false);
  });
});

describe("no text selection in the chrome (T7.3, F-3)", () => {
  it("keeps headings and buttons unselectable, and the log and code selectable", async () => {
    const userSelect = (l: Locator) => l.evaluate((e) => getComputedStyle(e).userSelect);
    expect(await userSelect(page.getByRole("heading", { name: copy.layers.title }))).toBe("none");
    expect(await userSelect(ui(page).undo())).toBe("none");
    expect(await userSelect(page.getByTestId("devserver-log"))).toBe("text");
    expect(await userSelect(page.getByTestId("project-root"))).toBe("text");
  });
});

describe("compose inside a closed Dialog (T7.4, F-6)", () => {
  const toggle = () => page.getByTestId("selection").getByTestId("open-in-canvas");

  it("opens it on the canvas by its trigger, takes a drop into it, and closes it", async () => {
    await page.getByTestId(`layer-${IDS.dialog}`).click();
    await expect.poll(() => toggle().textContent()).toBe(copy.selection.open("Dialog"));
    const before = homeFile();
    await toggle().click();
    await frame().getByRole("dialog").getByText("New game").waitFor();
    await expect.poll(() => toggle().textContent()).toBe(copy.selection.close("Dialog"));
    expect(homeFile()).toBe(before);

    // Into its content, below the header: the content's padding, in the dialog's lower half.
    const id = await placeFromPalette(page, "button", el(IDS.content), { fx: 0.5, fy: 0.92 });
    expect(childIds(IDS.content)).toEqual(["ui_dhd00", id]);
    // The dialog stays open across the edit.
    await frame().getByRole("dialog").locator(`[data-ui-id="${id}"]`).waitFor();

    // From something inside it, the toggle still names the Dialog.
    await expect.poll(() => toggle().textContent()).toBe(copy.selection.close("Dialog"));
    // Its text edits on the canvas too: the modal's focus trap leaves the editor alone.
    const title = frame().getByRole("dialog").locator('[data-ui-id="ui_dtt00"]');
    const at = await canvasPoint(page, "canvas-frame", title);
    const beforeText = homeFile();
    await page.mouse.dblclick(at.x, at.y);
    await frame().locator("skeleton-overlay [data-text-editor]").waitFor();
    await page.keyboard.type("Add a game");
    await page.keyboard.press("Enter");
    await edited(beforeText);
    expect(homeFile()).toContain('<DialogTitle data-ui-id="ui_dtt00">Add a game</DialogTitle>');
    await frame().getByRole("dialog").getByText("Add a game").waitFor();
    await toggle().click();
    await expect.poll(() => frame().getByRole("dialog").count()).toBe(0);
    await expect.poll(() => toggle().textContent()).toBe(copy.selection.open("Dialog"));
  });
});

describe("edit text on the canvas (T7.5, F-5)", () => {
  it("double-click, type, Enter: one setText; Escape changes nothing", async () => {
    const editor = frame().locator("skeleton-overlay [data-text-editor]");
    await el(IDS.title).scrollIntoViewIfNeeded();
    const at = await canvasPoint(page, "canvas-frame", el(IDS.title));
    let before = homeFile();
    await page.mouse.dblclick(at.x, at.y);
    await editor.waitFor();
    expect(await editor.inputValue()).toBe("Card title");
    await page.keyboard.type("Stats");
    await page.keyboard.press("Enter");
    const after = await edited(before);
    expect(after).toContain(`<CardTitle data-ui-id="${IDS.title}">Stats</CardTitle>`);
    // One line changed.
    const removed = before.split("\n").filter((l) => !after.split("\n").includes(l));
    expect(removed).toEqual([`              <CardTitle data-ui-id="${IDS.title}">Card title</CardTitle>`]);
    expect(await editor.count()).toBe(0);

    before = homeFile();
    await page.mouse.dblclick(at.x, at.y);
    await editor.waitFor();
    await page.keyboard.type("Nope");
    await page.keyboard.press("Escape");
    expect(await editor.count()).toBe(0);
    await page.waitForTimeout(500);
    expect(homeFile()).toBe(before);
  });

  it("does nothing on a container", async () => {
    const at = await canvasPoint(page, "canvas-frame", el(IDS.grid), { fx: 0.98, fy: 0.5 });
    await page.mouse.dblclick(at.x, at.y);
    await page.waitForTimeout(300);
    expect(await frame().locator("skeleton-overlay [data-text-editor]").count()).toBe(0);
  });
});

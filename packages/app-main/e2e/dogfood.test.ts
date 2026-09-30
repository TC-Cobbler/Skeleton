// Phase 6 dogfood driver: plays the user in the real app, one step per run.
//   DOGFOOD_STEP=<step> xvfb-run -a -s "-screen 0 1920x1200x24" pnpm exec vitest run -c vitest.e2e.config.ts e2e/dogfood.test.ts
// The project lives outside the repo (DOGFOOD_DIR), so it survives between steps.
// Skipped unless DOGFOOD_STEP is set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright-core";
import { sourceVersion } from "@skeleton/core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { canvasFrame, canvasPoint, placeFromPalette, waitForCanvas, type Aim } from "./canvas-click.js";

const STEP = process.env["DOGFOOD_STEP"] ?? "";
const DIR = process.env["DOGFOOD_DIR"] ?? "/home/user/dogfood";
const NAME = "Game Library";
const ROOT = path.join(DIR, "game-library");
const SHOTS = path.join(DIR, "shots");
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let app: ElectronApplication;
let page: Page;
let file = "src/pages/HomePage.tsx";
const read = (f = file) => readFileSync(path.join(ROOT, f), "utf8");
const frame = () => canvasFrame(page);
const props = () => page.getByTestId("properties");
const log = (s: string) => console.log(`[dogfood] ${s}`);

async function shot(name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `${STEP}-${name}.png`) });
}

/** Waits until the page file changed from `before`, and the canvas shows and maps it. */
async function edited(before: string, f = file) {
  await expect.poll(() => read(f), { timeout: 20_000 }).not.toBe(before);
  await waitForCanvas(page, sourceVersion(read(f)), "canvas-desktop").catch(() => undefined);
  await page.waitForTimeout(300);
}

/** Runs `action` and waits for the edit it makes to land. Fails on an edit error. */
async function edit(what: string, action: () => Promise<void>, f = file) {
  const before = read(f);
  await action();
  try {
    await edited(before, f);
  } catch (e) {
    const err = await page.getByTestId("edit-error").textContent().catch(() => null);
    throw new Error(`${what}: no edit landed${err ? ` (${err})` : ""}`, { cause: e });
  }
  log(`edit: ${what}`);
}

async function select(id: string) {
  await page.getByTestId(`layer-${id}`).click();
  await expect.poll(() => page.getByTestId("selection-id").textContent()).toBe(id);
}

async function setText(id: string, text: string) {
  await select(id);
  const input = props().getByLabel("Text");
  await edit(`text of ${id} → ${text}`, async () => {
    await input.fill(text);
    await input.press("Enter");
  });
}

async function setProp(id: string, label: string, value: string) {
  await select(id);
  await edit(`${label} of ${id} → ${value}`, () => props().getByLabel(label).selectOption(value).then(() => undefined));
}

async function place(paletteId: string, target: Locator, aim: Aim): Promise<string> {
  const before = read();
  const id = await placeFromPalette(page, paletteId, target, aim);
  await edited(before).catch(() => undefined);
  log(`place: ${paletteId} → ${id}`);
  return id;
}

const at = (id: string) => frame().locator(`[data-ui-id="${id}"]`).first();

/** The page file's tree, as the UI gets it. */
async function tree(): Promise<{ id: string | null; name: string; kind: string; children: unknown[] }[]> {
  const res = await page.evaluate(({ root, f }) => window.skeleton.invoke("page:tree", { projectRoot: root, file: f }), { root: ROOT, f: file });
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res.value.roots as never;
}
type N = { id: string | null; name: string; kind: string; children: N[] };
async function find(pred: (n: N) => boolean, under?: string): Promise<N> {
  const all: N[] = [];
  const walk = (n: N, inside: boolean) => {
    const now = inside || under === undefined || n.id === under;
    if (now && n.id !== under) all.push(n);
    n.children.forEach((c) => walk(c, now));
  };
  (await tree()).forEach((r) => walk(r as N, false));
  const hit = all.find(pred);
  if (!hit) throw new Error(`no node matching under ${under ?? "page"}`);
  return hit;
}

/** Drags the selected element by its label (its grip) to a point on `target`: a real move. */
async function moveByGrip(id: string, target: Locator, aim: Aim) {
  await select(id);
  const grip = frame().locator("skeleton-overlay [data-grab]");
  await grip.waitFor();
  // Like a user: scroll so the drop target is in view, then take the grip where it is now.
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await frame().locator("body").evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  await shot(`grip-${id}`);
  await edit(`move ${id}`, async () => {
    const to = await canvasPoint(page, "canvas-frame", target, aim);
    const from = await canvasPoint(page, "canvas-frame", grip);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(150);
    await shot(`move-${id}`);
    await page.mouse.up();
  });
}

/** A text or number property (committed on Enter). */
async function setInput(id: string, label: string, value: string) {
  await select(id);
  const input = props().getByLabel(label, { exact: true });
  await edit(`${label} of ${id} → ${value}`, async () => {
    await input.fill(value);
    await input.press("Enter");
  });
}

async function ledger(name: string, value: string) {
  const f = path.join(DIR, "tokens.json");
  const cur = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Record<string, string>) : {};
  cur[name] = value;
  writeFileSync(f, JSON.stringify(cur, null, 2));
}

async function note(id: string, type: "build" | "behaviour" | "question", text: string) {
  await select(id);
  await page.getByRole("tab", { name: /^Notes/ }).click();
  const form = page.getByRole("form", { name: "Add a note" });
  await form.getByLabel("Note type").selectOption(type);
  await form.getByLabel("Note text").fill(text);
  await form.getByRole("button", { name: "Add" }).click();
  await expect.poll(() => (existsSync(path.join(ROOT, "skeleton/notes.json")) ? read("skeleton/notes.json") : "")).toContain(text);
  await page.getByRole("tab", { name: "Element" }).click();
  log(`note: ${type} on ${id}: ${text}`);
}

async function token(name: string, value: string, dark = false) {
  await page.getByRole("tab", { name: /^Tokens/ }).click();
  const input = page.getByTestId(`token-${name}`).getByLabel(`${name} ${dark ? "dark " : ""}value`);
  await edit(`token ${name}${dark ? " (dark)" : ""} → ${value}`, async () => {
    await input.fill(value);
    await input.press("Enter");
  }, "src/styles/globals.css");
  await ledger(dark ? `${name}.dark` : name, value);
  await page.getByRole("tab", { name: "Element" }).click();
}

async function addPage(name: string): Promise<string> {
  const pages = page.getByRole("region", { name: "Pages" });
  await pages.getByRole("button", { name: "Add page" }).click();
  const form = pages.getByRole("form", { name: "Add page" });
  await form.getByLabel("Name").fill(name);
  await form.getByRole("button", { name: "Add" }).click();
  const f = `src/pages/${name.replace(/\s+/g, "")}Page.tsx`;
  await expect.poll(() => existsSync(path.join(ROOT, f)), { timeout: 20_000 }).toBe(true);
  log(`page: ${name} (${f})`);
  return f;
}

async function goToPage(label: RegExp, f: string) {
  await page.getByRole("region", { name: "Pages" }).getByRole("option", { name: label }).click();
  file = f;
  await waitForCanvas(page, sourceVersion(read(f)), "canvas-desktop").catch(() => undefined);
  await page.waitForTimeout(800);
}

async function handOff() {
  await page.getByRole("button", { name: "Hand off" }).click();
  await page.getByTestId("agent-veil").waitFor({ timeout: 240_000 });
  log("handed off");
  await shot("handed-off");
}

async function takeBack() {
  await page.getByRole("button", { name: "Take back" }).click();
  await expect.poll(() => page.getByTestId("loop").textContent(), { timeout: 240_000 }).toMatch(/With you/);
  await page.getByRole("tab", { name: /^Pass/ }).click();
  await page.waitForTimeout(800);
  log(`pass summary:\n${await page.getByTestId("pass").innerText()}`);
  await shot("pass");
}

beforeAll(async () => {
  if (!STEP) return;
  mkdirSync(SHOTS, { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "SKELETON_RENDERER_URL"));
  app = await _electron.launch({ args: [pkgRoot, "--no-sandbox"], cwd: pkgRoot, env: { ...env, SKELETON_USER_DATA: path.join(DIR, "profile") } });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
  await page.waitForFunction(() => window.innerWidth === 1600 && window.innerHeight === 1000);
  const exists = existsSync(ROOT);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, exists ? ROOT : DIR);
  if (exists) {
    await page.getByRole("button", { name: "Open…" }).click();
  } else {
    await page.getByRole("button", { name: "Change…" }).click();
    await page.getByLabel("Project name").fill(NAME);
    await page.getByRole("button", { name: "Create project" }).click();
  }
  await frame().locator("h1").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

const steps: Record<string, () => Promise<void>> = {
  async loop1() {
    const home = await tree();
    const stack = (home[0] as N).children[0] as N;
    const title = stack.children[0] as N;
    await setText(title.id as string, "My library");
    await shot("scaffolded");

    // Toolbar: search and Add game.
    const bar = await place("stack-horizontal", at(title.id as string), { fx: 0.5, fy: 0.9 });
    const search = await place("input", at(bar), { fx: 0.5, fy: 0.5 });
    const add = await place("button", at(search), { fx: 0.9, fy: 0.5 });
    await setText(add, "Add game");
    await setProp(bar, "Justify", "justify-between");

    // The library grid with one card: the agent repeats it per game.
    const grid = await place("grid", at(bar), { fx: 0.5, fy: 0.95 });
    const card = await place("card", at(grid), { fx: 0.5, fy: 0.5 });
    const cardTitle = await find((n) => n.name === "CardTitle", card);
    const cardDesc = await find((n) => n.name === "CardDescription", card);
    await setText(cardTitle.id as string, "Game title");
    await setText(cardDesc.id as string, "Platform");
    const content = await find((n) => n.name === "CardContent", card);
    await place("badge", at(content.id as string), { fx: 0.5, fy: 0.9 });
    await token("--radius", "0.75rem");
    await shot("composed");

    await note(grid, "build", "Show my game library: one card per game from mock data (8 games with title, platform, hours played, status)");
    await note(search, "behaviour", "Filter the cards by game title as I type, case-insensitive");
    await note(add, "question", "What should adding a game ask for? Suggest the fields; don't build it yet");
    await shot("notes");
    await handOff();
  },

  async takeback1() {
    await takeBack();
  },

  async loop2() {
    const ids = { title: "ui_52d7x", bar: "ui_e68kd", search: "ui_wd9tf", grid: "ui_am9jy", add: "ui_27ttm", badge: "ui_zogii" };
    await shot("start");
    // The grid landed inside the toolbar in loop 1. Four columns first, so the page fits
    // on screen, then move it out: title, grid, toolbar; then the toolbar up: title, toolbar, grid.
    await setProp(ids.grid, "Columns", "grid-cols-4");
    await moveByGrip(ids.grid, at(ids.title), { fx: 0.5, fy: 0.9 });
    await moveByGrip(ids.bar, at(ids.title), { fx: 0.5, fy: 0.9 });
    // A status filter next to the search.
    const status = await place("select", at(ids.search), { fx: 0.9, fy: 0.5 });
    const items = [await find((n) => n.name === "SelectItem", status)];
    const all: N[] = [];
    const collect = async () => {
      const walk = (n: N) => {
        if (n.name === "SelectItem") all.push(n);
        n.children.forEach(walk);
      };
      (await tree()).forEach((r) => walk(r as N));
    };
    await collect();
    const [first, second] = all.filter((n) => n.id !== null).slice(-2);
    void items;
    await setText(first!.id as string, "All statuses");
    await setInput(first!.id as string, "value", "all");
    await setText(second!.id as string, "Playing");
    await setInput(second!.id as string, "value", "playing");
    await token("--primary", "oklch(0.5 0.2 290)");
    await shot("composed");

    await note(status, "behaviour", "Filter the games by status; add the other statuses (Completed, Backlog, Dropped) as options; combine with the title filter");
    await note(ids.grid, "build", "Show an empty state in the grid when no game matches the filters");
    await note(ids.badge, "behaviour", "Colour the status badge by status, using theme tokens (ask for new tokens if you need them)");
    await handOff();
  },

  async takeback2() {
    await takeBack();
  },

  async loop3() {
    await shot("start");
    // Adjust the agent's empty state (inside its conditional: edited in place).
    // (Resumable: a step that already landed is skipped.)
    if (!read().includes('className="col-span-full items-center gap-2 py-12"')) await setProp("ui_e7k2q", "Padding Y", "py-12");
    if (!read().includes("Nothing here yet")) await setText("ui_p4w9n", "Nothing here yet");
    if (!read("src/styles/globals.css").includes("oklch(0.72 0.16 290)")) await token("--primary", "oklch(0.72 0.16 290)", true);

    // A Stats page: three stat cards.
    const f = existsSync(path.join(ROOT, "src/pages/StatsPage.tsx")) ? "src/pages/StatsPage.tsx" : await addPage("Stats");
    await goToPage(/Stats/, f);
    const home = await tree();
    const title = ((home[0] as N).children[0] as N).children[0] as N;
    const grid = read().includes("<Grid") ? "ui_7sj6n" : await place("grid", at(title.id as string), { fx: 0.5, fy: 0.9 });
    if (!read().includes("grid-cols-3")) await setProp(grid, "Columns", "grid-cols-3");
    const first = read().includes("<Card") ? "ui_gysjq" : await place("card", at(grid), { fx: 0.5, fy: 0.5 });
    // Aiming at a card's edge puts the next card inside it (F-4): undo that, then aim at the
    // grid's empty columns instead.
    if (read().includes("ui_cjmuo")) {
      await select("ui_cjmuo");
      await edit("delete the nested cards", () => page.getByTestId("selection").getByRole("button", { name: "Delete" }).click());
    }
    const second = await place("card", at(grid), { fx: 0.5, fy: 0.5 });
    const third = await place("card", at(grid), { fx: 0.85, fy: 0.5 });
    const cards = [first, second, third];
    const labels = [
      ["Games", "In your library"],
      ["Hours played", "Across all games"],
      ["Completed", "Finished games"],
    ];
    for (const [i, card] of cards.entries()) {
      const t = (await find((n) => n.name === "CardTitle", card)).id as string;
      if (!read().includes(`data-ui-id="${t}">${labels[i]![0]}<`)) await setText(t, labels[i]![0]!);
      const d = (await find((n) => n.name === "CardDescription", card)).id as string;
      if (!read().includes(`data-ui-id="${d}">${labels[i]![1]}<`)) await setText(d, labels[i]![1]!);
      const c = (await find((n) => n.name === "p", card)).id as string;
      if (!read().includes(`data-ui-id="${c}">0<`)) await setText(c, "0");
    }
    const flat = read("src/pages/StatsPage.tsx");
    if ((flat.match(/<Card /g) ?? []).length !== 3 || /<Card[^>]*>\s*<CardHeader[\s\S]*?<Card /.test(flat.split("</Card>")[0] ?? "")) throw new Error("stats cards aren't three siblings");
    await shot("composed");

    await note(grid, "build", "Compute these stats from the library data: number of games, total hours played, number completed (replace the 0s)");
    await note(title.id as string, "build", "Add navigation between Library (/) and Stats (/stats), shown at the top of both pages");
    await handOff();
  },

  async takeback3() {
    await takeBack();
  },

  async loop4() {
    await shot("start");
    // Edits on elements that now carry agent logic: move the Select (controlled by the
    // agent) before the search box; widen the Stats grid (holds the agent's values).
    await moveByGrip("ui_aar14", at("ui_wd9tf"), { fx: 0.05, fy: 0.5 });
    await goToPage(/Stats/, "src/pages/StatsPage.tsx");
    await setProp("ui_7sj6n", "Gap", "gap-6");
    await goToPage(/Home/, "src/pages/HomePage.tsx");

    // The Add game dialog, in the toolbar after the placeholder button, which then goes.
    const dialog = await place("dialog", at("ui_27ttm"), { fx: 0.95, fy: 0.5 });
    const trigger = await find((n) => n.name === "DialogTrigger", dialog);
    const button = await find((n) => n.name === "Button", trigger.id as string);
    await setText(button.id as string, "Add game");
    await setProp(button.id as string, "variant", "default");
    await setText((await find((n) => n.name === "DialogTitle", dialog)).id as string, "Add a game");
    await setText((await find((n) => n.name === "DialogDescription", dialog)).id as string, "It goes straight into your library.");
    // Confirm: the footer's own Button (Cancel sits inside DialogClose).
    const footer = await find((n) => n.name === "DialogFooter", dialog);
    const confirm = footer.children.find((c) => c.name === "Button");
    if (!confirm?.id) throw new Error("no Confirm button in the dialog footer");
    await select("ui_27ttm");
    await edit("delete the placeholder Add game button", () => page.getByTestId("selection").getByRole("button", { name: "Delete" }).click());
    await token("--radius", "0.5rem");
    await shot("composed");

    await note(dialog, "build", "Add-game form in this dialog: title (required), platform (select), status (select, default Backlog), hours played (number). Confirm adds the game, Cancel closes");
    await note(confirm.id as string, "behaviour", "Confirm is disabled until the title is filled in; after adding, close the dialog and clear the form");
    await note("ui_am9jy", "behaviour", "Keep added games across reloads (localStorage); newest first");
    await handOff();
  },

  async takeback4() {
    await takeBack();
  },

  async loop5() {
    await shot("start");
    // (Resumable: a step that already landed is skipped.)
    // Orphan tray: the loop 1 Question's button was deleted in loop 4; discard its note.
    if (read("skeleton/notes.json").includes("What should adding a game ask for?")) {
      await page.getByRole("tab", { name: /^Notes/ }).click();
      const tray = page.getByTestId("orphan-tray");
      await tray.waitFor();
      await shot("orphan-tray");
      const notesBefore = read("skeleton/notes.json");
      await tray.getByTestId("orphan").first().getByRole("button", { name: "Discard" }).click();
      await expect.poll(() => read("skeleton/notes.json")).not.toBe(notesBefore);
      await expect.poll(() => tray.count()).toBe(0);
      log("orphan note discarded");
      await page.getByRole("tab", { name: "Element" }).click();
    }

    // Edit the agent's form fields inside the closed dialog, from the Layers tree.
    if (!read().includes('data-ui-id="ui_dkbru">Hours<')) await setText("ui_dkbru", "Hours");
    if (!read().includes('data-ui-id="ui_xxt2l" className="gap-1"')) await setProp("ui_xxt2l", "Gap", "gap-1");

    // A separator under the title, and a softer secondary colour.
    if (!read().includes("<Separator")) await place("separator", at("ui_52d7x"), { fx: 0.5, fy: 0.9 });
    if (!read("src/styles/globals.css").includes("oklch(0.95 0.03 290)")) await token("--secondary", "oklch(0.95 0.03 290)");
    await shot("composed");

    const notes = () => read("skeleton/notes.json");
    if (!notes().includes("details sheet")) await note("ui_uxdga", "build", "Clicking a game card opens a details sheet (title, platform, hours played) where I can change the game's status");
    await goToPage(/Stats/, "src/pages/StatsPage.tsx");
    if (!notes().includes("count Dropped")) await note("ui_7sj6n", "question", "Should the stats count Dropped games? Say what you'd suggest; don't change it yet");
    await handOff();
  },

  async takeback5() {
    await takeBack();
  },

  // Closing session: Skeleton edits on the agent's pass 5 code, committed by a last
  // hand off (no tasks), then taken straight back so the project ends with the user.
  async after5() {
    await setProp("ui_n720r", "Gap", "gap-6");
    await setText("ui_zdt2m", "Hours");
    await shot("composed");
    await handOff();
  },

  async takeback6() {
    await takeBack();
  },
};

it.skipIf(!STEP)(`dogfood step ${STEP}`, async () => {
  const step = steps[STEP];
  if (!step) throw new Error(`unknown DOGFOOD_STEP ${STEP}; known: ${Object.keys(steps).join(", ")}`);
  await step();
}, 900_000);

// Silence unused-helper checks until later loops use them.

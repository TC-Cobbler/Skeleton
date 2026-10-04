// Phase 4 (tokens and gizmos) on a freshly scaffolded project. Gate 4 lives in gate4.test.ts.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildTree, findNodeById, readTokens } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, canvasPoint, clickOnCanvas, dragGizmo, placeFromPalette } from "./canvas-click.js";
import { canvasCopy, copy, names, pattern, startsWith, ui } from "./ui.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-tokens-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "tokens");
const css = () => readFileSync(path.join(projectRoot, "src/styles/globals.css"), "utf8");
const token = (name: string, block: "light" | "dark" | "theme" | "theme-inline" = "theme-inline") =>
  readTokens(css()).find((t) => t.name === name && t.block === block)?.value;
const frame = () => canvasFrame(page);
const homeFile = () => readFileSync(path.join(projectRoot, "src/pages/HomePage.tsx"), "utf8");
const classNameOf = (id: string) => findNodeById(buildTree(homeFile()).roots, id)?.props["className"] ?? null;
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
  await ui(page).picker.changeFolder().click();
  await ui(page).picker.projectName().fill("Tokens");
  await ui(page).picker.create().click();
  await frame().getByRole("heading", { name: "Tokens" }).waitFor({ timeout: 90_000 });
  await placeFromPalette(page, "button", frame().getByRole("heading", { name: "Tokens" }), { fx: 0.5, fy: 0.9 });
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("token panel (T4.1)", () => {
  const panel = () => ui(page).tokens();
  const row = (name: string) => panel().getByTestId(`token-${name}`);

  it("lists every token by group, colours with light and dark side by side", async () => {
    await ui(page).tab("tokens").click();
    await row("--radius").waitFor();
    for (const name of ["--radius", "--radius-button", "--spacing", "--type-base", "--text-lg", "--font-sans", "--primary", "--border-width"]) {
      expect(await row(name).count(), name).toBe(1);
    }
    expect(await row("--primary").getByLabel(copy.tokens.valueLabel(names.themeName("--primary"), "light")).inputValue()).toBe("oklch(0.205 0 0)");
    expect(await row("--primary").getByLabel(copy.tokens.valueLabel(names.themeName("--primary"), "dark")).inputValue()).toBe("oklch(0.922 0 0)");
    expect(await row("--radius-button").textContent()).toContain(copy.tokens.resolved("0.5rem"));
  });

  it("writes an exact value to globals.css, and the canvas follows", async () => {
    const input = row("--radius").getByLabel(copy.tokens.valueLabel(names.themeName("--radius")));
    await input.fill("1rem");
    await input.press("Enter");
    await expect.poll(() => token("--radius", "light")).toBe("1rem");
    // The Button's radius is derived: 1rem * 0.8 = 12.8px.
    await expect.poll(() => styleOf("button", "border-top-left-radius"), { timeout: 10_000 }).toBe("12.8px");
    await expect.poll(() => row("--radius-button").textContent()).toContain(copy.tokens.resolved("0.8rem"));
  });

  it("detaches a derived token to its value, and re-attaches it to the formula", async () => {
    await row("--radius-button").getByRole("button", { name: copy.tokens.detach }).click();
    await expect.poll(() => token("--radius-button")).toBe("0.8rem");
    await row("--radius-button").getByRole("button", { name: copy.tokens.attach }).click();
    await expect.poll(() => token("--radius-button")).toBe("calc(var(--radius) * 0.8)");
  });

  it("writes a dark value to .dark only", async () => {
    const input = row("--primary").getByLabel(copy.tokens.valueLabel(names.themeName("--primary"), "dark"));
    await input.fill("oklch(0.7 0.15 250)");
    await input.press("Enter");
    await expect.poll(() => token("--primary", "dark")).toBe("oklch(0.7 0.15 250)");
    expect(token("--primary", "light")).toBe("oklch(0.205 0 0)");
  });

  it("undoes a token write", async () => {
    await ui(page).undo().click();
    await expect.poll(() => token("--primary", "dark")).toBe("oklch(0.922 0 0)");
  });
});

describe("token-to-element map (T4.2)", () => {
  const panel = () => ui(page).tokens();
  const count = (name: string) => panel().getByTestId(`token-${name}`).getByTestId("token-count").textContent();
  const tokenBoxes = () =>
    frame()
      .locator("skeleton-overlay")
      .evaluate((el) => el.shadowRoot?.querySelectorAll("[data-token-box]").length ?? 0);

  it("counts the elements each token affects on the page, live", async () => {
    await expect.poll(() => count("--radius-button")).toBe("1");
    expect(Number(await count("--radius"))).toBeGreaterThanOrEqual(1);
    expect(Number(await count("--background"))).toBeGreaterThanOrEqual(1); // body
    await ui(page).tab("element").click();
    await placeFromPalette(page, "button", frame().getByRole("heading", { name: "Tokens" }), { fx: 0.5, fy: 0.9 });
    await ui(page).tab("tokens").click();
    await expect.poll(() => count("--radius-button")).toBe("2");
  });

  it("outlines what a token affects while its row is hovered", async () => {
    await panel().getByTestId("token---radius-button").hover();
    await expect.poll(tokenBoxes).toBe(2);
    await panel().getByRole("heading", { name: copy.tokens.title }).hover();
    await expect.poll(tokenBoxes).toBe(0);
  });
});

describe("gizmos (T4.3–T4.5)", () => {
  const buttons = () => frame().getByRole("button", { name: "Button" });
  const handle = (kind: string, part = "") => frame().locator(`skeleton-overlay .gz[data-kind="${kind}"]${part ? `[data-part="${part}"]` : ""}`);
  const label = () =>
    frame()
      .locator("skeleton-overlay [data-gizmo-label]")
      .first()
      .textContent({ timeout: 2000 })
      .catch(() => null);
  const radii = () => buttons().evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopLeftRadius));
  let buttonId = "";

  it("draws handles on the selected element", async () => {
    await ui(page).tab("element").click();
    await clickOnCanvas(page, "canvas-frame", buttons().first());
    buttonId = (await page.getByTestId("selection-id").textContent()) ?? "";
    expect(buttonId).toMatch(/^ui_[a-z0-9]{5}$/);
    await handle("radius").waitFor();
    expect(await handle("type").count()).toBe(1); // the Button has text
    expect(await frame().locator('skeleton-overlay .chip[data-chip="bg"]').count()).toBe(1);
  });

  it("labels the scope before the drag, following Shift and Alt (T4.5)", async () => {
    const at = await canvasPoint(page, "canvas-frame", handle("radius"));
    // Nudge until the overlay has seen the pointer on the handle.
    await expect
      .poll(async () => {
        await page.mouse.move(at.x, at.y + 1);
        await page.mouse.move(at.x, at.y);
        return label();
      })
      .toMatch(startsWith(canvasCopy.gizmos.hover(canvasCopy.gizmos.radiusComponent(names.themeName("--radius-button"), names.kindOf("Button")))));
    try {
      await page.keyboard.down("Shift");
      await page.mouse.move(at.x + 1, at.y);
      await expect.poll(label).toMatch(startsWith(canvasCopy.gizmos.hover(canvasCopy.gizmos.radiusGlobal(names.themeName("--radius")))));
      await page.keyboard.up("Shift");
      await page.keyboard.down("Alt");
      await page.mouse.move(at.x, at.y + 1);
      await expect.poll(label).toMatch(startsWith(canvasCopy.gizmos.hover(canvasCopy.gizmos.instance)));
    } finally {
      await page.keyboard.up("Shift");
      await page.keyboard.up("Alt");
    }
  });

  it("plain drag: every Button follows live, and --radius-button is written on release (T4.4)", async () => {
    const before = await radii();
    const cssBefore = css();
    await dragGizmo(page, handle("radius"), 24, 24, {
      during: async () => {
        const live = await radii();
        expect(live[0]).not.toBe(before[0]);
        expect(new Set(live).size).toBe(1); // both Buttons
        expect(await label()).toMatch(pattern(canvasCopy.gizmos.readout(names.themeName("--radius-button"), ""), /.*/, canvasCopy.gizmos.dragging("", canvasCopy.gizmos.elements(2))));
        expect(css()).toBe(cssBefore); // nothing written mid-drag
      },
    });
    await expect.poll(() => token("--radius-button"), { timeout: 10_000 }).not.toBe("calc(var(--radius) * 0.8)");
    expect(token("--radius-button")).toMatch(/^calc\(var\(--radius\) \* (\d*\.\d+|\d+)\)$/);
    await expect.poll(async () => new Set(await radii()).size).toBe(1);
    expect((await radii())[0]).not.toBe(before[0]);
  });

  it("Shift-drag: the base --radius changes, and derived radii follow", async () => {
    const component = token("--radius-button");
    const card = token("--radius-card");
    const base = token("--radius", "light");
    await dragGizmo(page, handle("radius"), -16, -16, { modifier: "Shift", during: async () => expect(await label()).toMatch(pattern(/^/, canvasCopy.gizmos.readout(names.themeName("--radius"), ""), /[\d.]+px · \d+ elements$/)) });
    await expect.poll(() => token("--radius", "light"), { timeout: 10_000 }).not.toBe(base);
    expect(token("--radius-button")).toBe(component);
    expect(token("--radius-card")).toBe(card); // still derived: it follows
  });

  it("Alt-drag: only this Button changes, with an arbitrary class", async () => {
    const cssBefore = css();
    await frame().locator("style[data-skeleton-live]").waitFor({ state: "detached", timeout: 10_000 });
    const before = await radii();
    await dragGizmo(page, handle("radius"), 20, 20, { modifier: "Alt", during: async () => expect(await label()).toMatch(pattern(/^[\d.]+px/, canvasCopy.gizmos.dragging("", canvasCopy.gizmos.thisElement), /$/)) });
    await expect.poll(() => classNameOf(buttonId), { timeout: 10_000 }).toMatch(/^rounded-\[\d+px\]$/);
    expect(css()).toBe(cssBefore);
    await expect.poll(async () => (await radii())[0]).not.toBe(before[0]);
    expect((await radii())[1]).toBe(before[1]);
  });

  it("steps a Stack's gap through the spacing scale", async () => {
    const stack = frame().locator("[data-ui-id]").filter({ has: buttons().first() }).last();
    await clickOnCanvas(page, "canvas-frame", frame().getByRole("heading", { name: "Tokens" }));
    // Select the Stack from the layers tree (its area is covered by children).
    const stackId = await stack.getAttribute("data-ui-id");
    await page.getByTestId(`layer-${stackId}`).click();
    await handle("gap").first().waitFor();
    const before = classNameOf(stackId as string);
    await dragGizmo(page, handle("gap").first(), 0, 20);
    await expect.poll(() => classNameOf(stackId as string), { timeout: 10_000 }).not.toBe(before);
    expect(String(classNameOf(stackId as string))).toMatch(/\bgap-\d+(\.\d+)?\b/);
  });
});

describe("colour chip and picker (T4.3, T4.7)", () => {
  const chip = (utility: string) => frame().locator(`skeleton-overlay .chip[data-chip="${utility}"]`);
  const panel = () => page.getByTestId("colour-panel");
  const bg = () => frame().getByRole("button", { name: "Button" }).nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
  const clickChip = async (utility: string) => {
    await chip(utility).waitFor();
    const at = await canvasPoint(page, "canvas-frame", chip(utility));
    await page.mouse.click(at.x, at.y);
    await panel().waitFor();
  };

  it("opens a picker on the selection's colour, and edits the token for light mode", async () => {
    await clickOnCanvas(page, "canvas-frame", frame().getByRole("button", { name: "Button" }).nth(1));
    await clickChip("bg");
    expect(await panel().textContent()).toContain(names.themeName("--primary"));
    expect(await panel().getByRole("button", { name: copy.colour.token("light") }).getAttribute("aria-pressed")).toBe("true");
    const before = await bg();
    await panel().getByLabel(copy.colour.pick).fill("#3366cc");
    await expect.poll(() => token("--primary", "light"), { timeout: 10_000 }).toBe(await hexOklch("#3366cc"));
    expect(token("--primary", "dark")).toBe("oklch(0.922 0 0)");
    await expect.poll(bg, { timeout: 10_000 }).not.toBe(before);
  });

  it("in dark mode, edits the dark value only (T4.7)", async () => {
    await ui(page).colourMode().getByRole("button", { name: copy.app.dark }).click();
    await clickChip("bg");
    expect(await panel().getByRole("button", { name: copy.colour.token("dark") }).getAttribute("aria-pressed")).toBe("true");
    await panel().getByLabel(copy.colour.pick).fill("#cc3366");
    await expect.poll(() => token("--primary", "dark"), { timeout: 10_000 }).toBe(await hexOklch("#cc3366"));
    expect(token("--primary", "light")).toBe(await hexOklch("#3366cc"));
    await ui(page).colourMode().getByRole("button", { name: copy.app.light }).click();
  });

  it("'This element' writes an arbitrary colour class instead", async () => {
    const cssBefore = css();
    const id = (await page.getByTestId("selection-id").textContent()) ?? "";
    await clickChip("bg");
    await panel().getByRole("button", { name: copy.colour.instance }).click();
    await panel().getByLabel(copy.colour.pick).fill("#ff0000");
    await expect.poll(() => classNameOf(id), { timeout: 10_000 }).toBe("bg-[#ff0000]");
    expect(css()).toBe(cssBefore);
  });
});

describe("violations panel (T4.6)", () => {
  const panel = () => ui(page).violations();
  const rows = () => panel().getByTestId("violation");
  const row = (value: string) => rows().filter({ has: page.locator("code.violation-value", { hasText: value }) });
  const config = () => JSON.parse(readFileSync(path.join(projectRoot, "skeleton/config.json"), "utf8")) as { acknowledgedViolations: unknown[] };

  it("lists the overrides made with Alt, with element, property and nearest token", async () => {
    await ui(page).tab("violations").click();
    await expect.poll(() => rows().count(), { timeout: 10_000 }).toBe(2);
    expect(await ui(page).tab("violations").textContent()).toBe(copy.app.tabs.violations(2));
    const radius = row("rounded-[");
    expect(await radius.textContent()).toMatch(pattern(names.kindOf("Button"), /.*/, copy.violations.property.radius));
    expect(await radius.locator("[data-ui-id]").getAttribute("data-ui-id")).toMatch(/^ui_[a-z0-9]{5}$/);
    expect(await radius.textContent()).toMatch(pattern(copy.violations.nearest, / .+ \(.+\)/));
    expect(await radius.locator("[data-nearest]").getAttribute("data-nearest")).toMatch(/^rounded-\S+$/);
    expect(await row("bg-[#ff0000]").textContent()).toMatch(pattern(copy.violations.nearest, / .+ \(.+\)/));
    expect(await row("bg-[#ff0000]").locator("[data-nearest]").getAttribute("data-nearest")).toMatch(/^bg-\S+$/);
  });

  it("snaps an override to the nearest token", async () => {
    const nearest = (await row("rounded-[").locator("[data-nearest]").getAttribute("data-nearest")) as string;
    await row("rounded-[").getByRole("button", { name: copy.violations.snap }).click();
    await expect.poll(() => homeFile(), { timeout: 10_000 }).toContain(`className="${nearest}"`);
    await expect.poll(() => rows().count()).toBe(1);
  });

  it("promotes an override to a new token", async () => {
    await row("bg-[#ff0000]").getByRole("button", { name: copy.violations.promote }).click();
    await row("bg-[#ff0000]").getByLabel(copy.violations.tokenName).fill("brand");
    await row("bg-[#ff0000]").getByRole("button", { name: copy.violations.create }).click();
    await expect.poll(() => token("--brand", "light"), { timeout: 10_000 }).toBe("#ff0000");
    expect(token("--brand", "dark")).toBe("#ff0000");
    expect(token("--color-brand")).toBe("var(--brand)");
    await expect.poll(() => homeFile()).toContain('className="bg-brand"');
    await expect.poll(() => rows().count()).toBe(0);
    expect(await panel().textContent()).toContain(copy.violations.empty);
  });

  it("keeps an override in agent code, in skeleton/config.json", async () => {
    // The agent adds an inline style (a contract breach Skeleton can't fix for it).
    const source = homeFile();
    writeFileSync(path.join(projectRoot, "src/pages/HomePage.tsx"), source.replace("</Stack>", '  <p data-ui-id="ui_agnt1" style={{ color: "red" }}>agent</p>\n      </Stack>'));
    await expect.poll(() => rows().count(), { timeout: 10_000 }).toBe(1);
    expect(await rows().first().textContent()).toContain(copy.violations.inAgentCode);
    expect(await rows().first().getByRole("button", { name: copy.violations.snap }).count()).toBe(0);
    await rows().first().getByRole("button", { name: copy.violations.keep }).click();
    await expect.poll(() => config().acknowledgedViolations, { timeout: 10_000 }).toEqual([
      { file: "src/pages/HomePage.tsx", id: "ui_agnt1", value: 'style={{ color: "red" }}' },
    ]);
    await expect.poll(() => rows().count()).toBe(0);
    await panel().getByLabel(copy.violations.showKeptLabel).check();
    expect(await rows().count()).toBe(1);
  });
});

/** The oklch the renderer writes for a hex colour (same conversion, run in the app). */
async function hexOklch(hex: string): Promise<string> {
  const { hexToOklch } = await import("../../app-renderer/src/colour.js");
  return hexToOklch(hex);
}

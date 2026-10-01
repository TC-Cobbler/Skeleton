import type { FrameLocator, Locator, Page } from "playwright-core";
import { ui } from "./ui.js";

/**
 * Clicks an element inside a canvas frame with the real mouse, like a user.
 *
 * Canvas frames are CSS-scaled cross-origin iframes (T2.7). Playwright's own
 * click computes coordinates inside them as if unscaled, so it aims at the wrong
 * spot (and reports other elements "intercepting"). Here the element's centre in
 * the iframe is mapped through the frame's scale to the window explicitly.
 */
export async function clickOnCanvas(page: Page, frameTestId: string, target: Locator): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const inner = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const outer = await page.getByTestId(frameTestId).evaluate((el) => {
    const frame = el as HTMLIFrameElement;
    const r = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);
    const scale = Number(frame.style.zoom || 1);
    return { x: r.x, y: r.y, left: parseFloat(cs.borderLeftWidth), top: parseFloat(cs.borderTopWidth), scale };
  });
  // Let the browser paint after the scroll (so its hit-test data for the iframe is
  // current), then move and click like a person would.
  await target.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const x = outer.x + (outer.left + inner.x) * outer.scale;
  const y = outer.y + (outer.top + inner.y) * outer.scale;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

export function canvasFrame(page: Page, frameTestId = "canvas-frame"): FrameLocator {
  return page.frameLocator(`[data-testid="${frameTestId}"]`);
}

/** Where on a canvas element to aim, as fractions of its box (0,0 is top left). */
export interface Aim {
  fx: number;
  fy: number;
}

/** Window coordinates of a point on an element inside a (scaled) canvas frame. */
export async function canvasPoint(page: Page, frameTestId: string, target: Locator, aim: Aim = { fx: 0.5, fy: 0.5 }): Promise<{ x: number; y: number }> {
  const inner = await target.evaluate(
    (el, a) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * a.fx, y: r.y + r.height * a.fy };
    },
    aim,
  );
  const outer = await page.getByTestId(frameTestId).evaluate((el) => {
    const frame = el as HTMLIFrameElement;
    const r = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);
    return { x: r.x, y: r.y, left: parseFloat(cs.borderLeftWidth), top: parseFloat(cs.borderTopWidth), scale: Number(frame.style.zoom || 1) };
  });
  return { x: outer.x + (outer.left + inner.x) * outer.scale, y: outer.y + (outer.top + inner.y) * outer.scale };
}

/**
 * Drags `source` (in Skeleton's window) onto a point on `target` (inside a canvas
 * frame) with the real mouse, in steps, like a user.
 */
export async function dragToCanvas(page: Page, source: Locator, target: Locator, aim: Aim, frameTestId = "canvas-frame"): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error("drag source has no box");
  await target.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const to = await canvasPoint(page, frameTestId, target, aim);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  // Let the overlay answer the last position before releasing.
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/**
 * Drags a palette entry onto the canvas and waits until the placed element is
 * selected and mapped on screen: the canvas and the parsed tree are then in sync
 * (same file version), so the next drag or click lands where it's aimed.
 */
export async function placeFromPalette(page: Page, paletteId: string, target: Locator, aim: Aim): Promise<string> {
  // The placed element is the one selected that wasn't in the layers tree before. "The
  // selection changed" isn't enough: after an edit it can briefly show the previous
  // edit's element, which let a drop return before it had landed (KI-1).
  const existing = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="layer-ui_"]')].map((row) => row.getAttribute("data-testid")?.slice(6) ?? ""));
  const item = ui(page).palette().getByTestId(`palette-${paletteId}`);
  await dragToCanvas(page, item, target, aim);
  const handle = await page.waitForFunction(
    (previous) => {
      const id = document.querySelector('[data-testid="selection-id"]')?.textContent ?? "";
      const row = document.querySelector(`[data-testid="layer-${id}"]`);
      const error = document.querySelector('[data-testid="edit-error"]')?.textContent;
      if (error) return `error: ${error}`;
      return /^ui_[a-z0-9]{5}$/.test(id) && !previous.includes(id) && row !== null && !row.classList.contains("is-offscreen") ? id : false;
    },
    existing,
    { timeout: 15_000 },
  );
  const id = (await handle.jsonValue()) as string;
  if (id.startsWith("error: ")) throw new Error(`placing ${paletteId} failed: ${id.slice(7)}`);
  return id;
}

/** Waits until the canvas shows, and has mapped, the page file at `version` (core's sourceVersion). */
export async function waitForCanvas(page: Page, version: string, frameTestId = "canvas-desktop"): Promise<void> {
  await page.locator(`[data-testid="${frameTestId}"][data-version="${version}"]`).waitFor({ timeout: 15_000 });
}

/** Drags from one point on the canvas to another with the real mouse (a move, T3.3). */
export async function moveOnCanvas(page: Page, source: Locator, target: Locator, aim: Aim, frameTestId = "canvas-frame"): Promise<void> {
  await source.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const from = await canvasPoint(page, frameTestId, source);
  const to = await canvasPoint(page, frameTestId, target, aim);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/**
 * Drags a gizmo handle (T4.3) by (dx, dy) window pixels with the real mouse, holding
 * `modifier` (Shift or Alt) for the whole drag. `during` runs before the release, for
 * checking the live preview.
 *
 * A drag that never started because Chromium lost the press (KI-1: input to a scaled
 * cross-origin frame) shows no live preview; it wrote nothing, so it's retried.
 */
export async function dragGizmo(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
  options: { modifier?: "Shift" | "Alt"; during?: () => Promise<void>; frameTestId?: string } = {},
): Promise<void> {
  const frameTestId = options.frameTestId ?? "canvas-frame";
  const live = page.frameLocator(`[data-testid="${frameTestId}"]`).locator("style[data-skeleton-live]");
  for (let attempt = 1; ; attempt++) {
    // A previous gizmo's preview stays until the page updates; wait for it to go.
    await live.waitFor({ state: "detached", timeout: 10_000 });
    await handle.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const from = await canvasPoint(page, frameTestId, handle);
    await page.mouse.move(from.x, from.y);
    if (options.modifier) await page.keyboard.down(options.modifier);
    let started = false;
    try {
      await page.mouse.down();
      await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
      await page.waitForTimeout(50);
      started = (await live.count()) > 0;
      if (started) await options.during?.();
    } finally {
      await page.mouse.up();
      if (options.modifier) await page.keyboard.up(options.modifier);
    }
    if (started) return;
    if (attempt === 3) throw new Error("the gizmo drag didn't start in 3 tries (KI-1?)");
    console.warn(`gizmo drag didn't start (lost press, KI-1); retrying`);
    await page.waitForTimeout(300);
  }
}

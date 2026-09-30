import type { FrameLocator, Locator, Page } from "playwright-core";

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
  const selected = () => page.evaluate(() => document.querySelector('[data-testid="selection-id"]')?.textContent ?? "");
  const before = await selected();
  const item = page.getByRole("region", { name: "Palette" }).getByTestId(`palette-${paletteId}`);
  await dragToCanvas(page, item, target, aim);
  const handle = await page.waitForFunction(
    (previous) => {
      const id = document.querySelector('[data-testid="selection-id"]')?.textContent ?? "";
      const row = document.querySelector(`[data-testid="layer-${id}"]`);
      const error = document.querySelector('[data-testid="edit-error"]')?.textContent;
      if (error) return `error: ${error}`;
      return /^ui_[a-z0-9]{5}$/.test(id) && id !== previous && row !== null && !row.classList.contains("is-offscreen") ? id : false;
    },
    before,
    { timeout: 15_000 },
  );
  const id = (await handle.jsonValue()) as string;
  if (id.startsWith("error: ")) throw new Error(`placing ${paletteId} failed: ${id.slice(7)}`);
  return id;
}

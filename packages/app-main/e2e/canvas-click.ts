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

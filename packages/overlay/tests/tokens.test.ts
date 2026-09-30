import { afterEach, describe, expect, it, vi } from "vitest";
import { Overlay } from "../src/overlay.js";
import type { HostMessage, OverlayMessage, TokenUsage } from "../src/protocol.js";
import { isHostMessage, isOverlayMessage } from "../src/protocol.js";
import { stripVariants, TokenMatcher } from "../src/tokens.js";

// What core's tokenUsage says for a few scaffold tokens.
const usage: Record<string, TokenUsage> = {
  "--radius-button": { classes: ["^rounded(-(t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-button$"], selectors: [] },
  "--primary": { classes: ["^-?(bg|text|border|ring)-primary(\\/[\\w.%-]+)?$"], selectors: [] },
  "--background": { classes: ["^-?(bg|text)-background(\\/[\\w.%-]+)?$"], selectors: ["body", ":bogus("] },
};

function page(): void {
  document.body.innerHTML = `
    <button class="rounded-button bg-primary hover:bg-primary/90">A</button>
    <button class="rounded-button border">B</button>
    <div class="rounded-card"><span class="[&_svg]:size-4 text-primary">C</span></div>`;
}

describe("TokenMatcher (T4.2)", () => {
  it("counts elements by their base utilities, variants stripped, and base selectors", () => {
    page();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const matcher = new TokenMatcher(usage, document.createElement("div"));
    expect(warn).toHaveBeenCalledOnce(); // the bad selector is dropped up front
    expect(matcher.count(document.body, null)).toEqual({ "--radius-button": 2, "--primary": 2, "--background": 1 });
    expect(matcher.elements(document.body, null, "--primary").map((e) => e.textContent)).toEqual(["A", "C"]);
    warn.mockRestore();
  });

  it("strips variants but not colons inside brackets", () => {
    expect(stripVariants("md:hover:p-4")).toBe("p-4");
    expect(stripVariants("[&_svg]:size-4")).toBe("size-4");
    expect(stripVariants("has-[>svg]:px-2.5")).toBe("px-2.5");
    expect(stripVariants("data-[state=open]:bg-accent")).toBe("bg-accent");
  });
});

describe("Overlay token counts (T4.2)", () => {
  let overlay: Overlay | null = null;
  afterEach(() => overlay?.destroy());

  it("reports counts on request and again when the page changes, and outlines a highlighted token", async () => {
    page();
    const sent: OverlayMessage[] = [];
    const host = { postMessage: vi.fn((m: OverlayMessage) => sent.push(m)) } as unknown as Window;
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb) => frames.push(cb);
    window.cancelAnimationFrame = () => undefined;
    const flush = () => frames.splice(0).forEach((cb) => cb(0));
    overlay = new Overlay({ win: window, host });
    overlay.start();
    const send = (data: HostMessage) => window.dispatchEvent(new MessageEvent("message", { data, source: host }));
    const counts = () => sent.filter((m) => m.type === "token-counts");

    const valid = { "--radius-button": { classes: usage["--radius-button"]?.classes ?? [], selectors: [] } };
    send({ source: "skeleton-host", type: "token-usage", usage: valid });
    expect(counts().at(-1)).toMatchObject({ counts: { "--radius-button": 2 } });

    document.body.insertAdjacentHTML("beforeend", `<button class="sm:rounded-tl-button">D</button>`);
    await Promise.resolve(); // mutation records
    flush();
    expect(counts().at(-1)).toMatchObject({ counts: { "--radius-button": 3 } });
    const n = counts().length;
    flush();
    expect(counts().length).toBe(n); // unchanged: not re-sent

    send({ source: "skeleton-host", type: "token-highlight", name: "--radius-button" });
    flush();
    // jsdom lays nothing out, so the boxes are empty and skipped; the message is accepted.
    expect(document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML).not.toContain("data-token-box");
    send({ source: "skeleton-host", type: "token-usage", usage: null });
    document.body.insertAdjacentHTML("beforeend", `<button class="rounded-button">E</button>`);
    await Promise.resolve();
    flush();
    expect(counts().length).toBe(n);
  });

  it("validates the new messages", () => {
    expect(isHostMessage({ source: "skeleton-host", type: "token-usage", usage: { "--x": { classes: ["a"], selectors: [] } } })).toBe(true);
    expect(isHostMessage({ source: "skeleton-host", type: "token-usage", usage: { "--x": { classes: [1], selectors: [] } } })).toBe(false);
    expect(isHostMessage({ source: "skeleton-host", type: "token-highlight", name: null })).toBe(true);
    expect(isOverlayMessage({ source: "skeleton-overlay", type: "token-counts", counts: { "--x": 2 } })).toBe(true);
    expect(isOverlayMessage({ source: "skeleton-overlay", type: "token-counts", counts: { "--x": "2" } })).toBe(false);
  });
});

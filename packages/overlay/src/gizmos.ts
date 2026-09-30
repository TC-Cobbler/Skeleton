// Gizmos (T4.3–T4.5): the handles drawn on the selected element, and what dragging
// one does in each scope. Pure: the overlay measures the element and the pointer,
// this works out the preview (a stylesheet) and the write to commit on release.
// See docs/decisions/010-tokens-and-gizmos.md.

import type { GizmoCommit, GizmoToken } from "./protocol.js";

export type GizmoKind = "radius" | "gap" | "padding" | "type" | "border";

/** Plain drag, Shift, Alt (PRD §10.3). */
export type Scope = "component" | "global" | "instance";

export type Edge = "top" | "right" | "bottom" | "left";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the overlay measured on the selected element's first DOM element. */
export interface Measured {
  rect: Rect;
  /** A layout container (Stack, Grid, a plain layout element): it gets gap and padding handles. */
  container: boolean;
  /** Its classes without variants (`hover:…` are left out: they aren't the base value). */
  classes: string[];
  radius: number;
  /** The main axis its children run along (flex or grid), or null. */
  flow: "row" | "column" | null;
  gap: number;
  padding: Record<Edge, number>;
  fontSize: number;
  /** It has text of its own (a baseline to grab). */
  hasText: boolean;
  borderWidth: number;
  /** Where the gap between each pair of neighbouring children is, along `flow`. */
  gaps: Rect[];
  /** px per rem, from the root's font size. */
  rem: number;
}

export interface GizmoData {
  tokens: GizmoToken[];
  /** Spacing scale steps (`gap-4` → 4), for plain gap and padding drags. */
  spacingSteps: number[];
  /** Why this element's classes can't be edited, or null when they can (instance and step edits). */
  classEdits: string | null;
}

export interface Handle {
  kind: GizmoKind;
  /** Which padding edge, or which gap (index among `gaps`). */
  part: Edge | number | null;
  rect: Rect;
}

/** How a pointer delta becomes a value change: direction and sensitivity. */
interface Axis {
  dx: number;
  dy: number;
}

export interface Drag {
  label: string;
  /** The token being changed, or null for a class edit on this element. */
  token: string | null;
  /** Value of the dragged property, in px, for a pointer delta. */
  valueAt(dx: number, dy: number): number;
  /** The stylesheet that previews `px` while dragging, and what to write for it on release. */
  at(px: number): { css: string; commit: GizmoCommit; text: string };
}

/** Where the live preview marks the instance being dragged. */
export const LIVE_TARGET = "data-skeleton-gizmo";
const TARGET = `[${LIVE_TARGET}]`;

export function scopeOf(modifiers: { shiftKey: boolean; altKey: boolean }): Scope {
  if (modifiers.altKey) return "instance";
  if (modifiers.shiftKey) return "global";
  return "component";
}

const HANDLE = 10;

/** The handles for an element, in drawing order (the radius dot last, on top). */
export function handlesFor(m: Measured): Handle[] {
  const out: Handle[] = [];
  const { x, y, width: w, height: h } = m.rect;
  if (w < 8 || h < 8) return out;
  if (m.container && m.flow !== null) {
    m.gaps.forEach((g, i) => {
      const cx = g.x + g.width / 2;
      const cy = g.y + g.height / 2;
      out.push({ kind: "gap", part: i, rect: m.flow === "row" ? { x: cx - 3, y: cy - 8, width: 6, height: 16 } : { x: cx - 8, y: cy - 3, width: 16, height: 6 } });
    });
    const p = m.padding;
    const mid = (a: number, b: number) => a + Math.max(b, 6) / 2;
    out.push({ kind: "padding", part: "top", rect: { x: x + w / 2 - 8, y: mid(y, p.top) - 3, width: 16, height: 6 } });
    out.push({ kind: "padding", part: "bottom", rect: { x: x + w / 2 - 8, y: y + h - mid(0, p.bottom) - 3, width: 16, height: 6 } });
    out.push({ kind: "padding", part: "left", rect: { x: mid(x, p.left) - 3, y: y + h / 2 - 8, width: 6, height: 16 } });
    out.push({ kind: "padding", part: "right", rect: { x: x + w - mid(0, p.right) - 3, y: y + h / 2 - 8, width: 6, height: 16 } });
  }
  if (m.hasText) {
    // The baseline, roughly: a fifth of the font size above the bottom of the line.
    out.push({ kind: "type", part: null, rect: { x: x - 14, y: y + h - m.fontSize * 0.2 - 2, width: 12, height: 4 } });
  }
  if (m.borderWidth > 0) out.push({ kind: "border", part: null, rect: { x: x + w - 2, y: y + h / 2 - 12, width: 4, height: 24 } });
  // Radius: a dot just inside the top-left corner. A fixed inset, so it stays under
  // the pointer while the radius changes (live, and again when the write lands).
  const inset = Math.min(10, w / 4, h / 4);
  out.push({ kind: "radius", part: null, rect: square(x + inset, y + inset) });
  return out;
}

function square(cx: number, cy: number): Rect {
  return { x: cx - HANDLE / 2, y: cy - HANDLE / 2, width: HANDLE, height: HANDLE };
}

/** What a drag on `handle` in `scope` does, or why it can't. */
export function planDrag(handle: Handle, scope: Scope, m: Measured, data: GizmoData): Drag | { unavailable: string } {
  const tokens = new Map(data.tokens.map((t) => [t.name, t]));
  const px = (name: string) => toPx(tokens.get(name)?.resolved ?? tokens.get(name)?.value ?? null, m.rem);
  const rem = (value: number) => `${round(value / m.rem, 4)}rem`;
  const needsClasses = () => (data.classEdits ? { unavailable: data.classEdits } : null);
  const instance = (group: string, prop: string, utility: (v: number) => string, start: number, axis: Axis, min = 0): Drag | { unavailable: string } =>
    needsClasses() ?? {
      label: "this element only",
      token: null,
      valueAt: linear(start, axis, min),
      at: (v) => ({ css: `${TARGET}{${prop}:${v}px!important}`, commit: { kind: "class", remove: group, add: utility(v) }, text: utility(v) }),
    };

  switch (handle.kind) {
    case "radius": {
      const axis = { dx: 0.5, dy: 0.5 };
      const own = m.classes.map((c) => /^rounded-([a-z0-9]+)$/.exec(c)?.[1]).find((x) => x !== undefined && tokens.has(`--radius-${x}`));
      const compName = own === undefined ? null : `--radius-${own}`;
      const comp = compName ? tokens.get(compName) : undefined;
      const base = px("--radius");
      const factor = comp ? factorOf(comp.value) : null;
      if (scope === "instance") return instance(RADIUS_GROUP, "border-radius", (v) => `rounded-[${v}px]`, m.radius, axis);
      if (scope === "global") {
        if (base === null) return { unavailable: "--radius isn't a length" };
        return {
          label: "--radius (every radius derived from it)",
          token: "--radius",
          valueAt: linear(m.radius, axis, 0),
          at: (v) => {
            // Keep this element under the pointer: the base it would need, through its own factor.
            const next = factor !== null && factor > 0 ? v / factor : base + (v - m.radius);
            const value = rem(Math.max(0, next));
            return { css: `:root{--radius:${value}!important}`, commit: tokenCommit("--radius", value), text: `--radius: ${value}` };
          },
        };
      }
      if (!compName || !comp) return { unavailable: "it has no radius token (rounded-button, rounded-card…)" };
      return {
        label: `${compName} (every ${own})`,
        token: compName,
        valueAt: linear(m.radius, axis, 0),
        at: (v) => {
          // An attached token keeps following --radius: only its factor changes.
          const value = factor !== null && base !== null && base > 0 ? `calc(var(--radius) * ${round(v / base, 3)})` : rem(v);
          return { css: `.${cssEscape(`rounded-${own}`)}{border-radius:${v}px!important}`, commit: tokenCommit(compName, value), text: `${compName}: ${value}` };
        },
      };
    }
    case "gap":
    case "padding": {
      const edge = handle.kind === "padding" ? (handle.part as Edge) : null;
      const along = m.flow === "row";
      const axis: Axis =
        edge === null ? (along ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 }) : { top: { dx: 0, dy: 1 }, bottom: { dx: 0, dy: -1 }, left: { dx: 1, dy: 0 }, right: { dx: -1, dy: 0 } }[edge];
      const prefix = edge === null ? "gap" : paddingPrefix(m.classes, edge);
      const start = edge === null ? m.gap : m.padding[edge];
      const prop = edge === null ? "gap" : { p: "padding", px: "padding-inline", py: "padding-block" }[prefix as "p" | "px" | "py"];
      const group = `^${prefix}-(\\d+(\\.\\d+)?|px|\\[[^\\]]+\\])$`;
      const step = m.classes.map((c) => new RegExp(`^${prefix}-(\\d+(\\.\\d+)?)$`).exec(c)?.[1]).find((x) => x !== undefined);
      const spacing = px("--spacing");
      const what = edge === null ? "gap" : "padding";
      if (scope === "instance") return instance(group, prop, (v) => `${prefix}-[${v}px]`, start, axis);
      if (spacing === null || spacing <= 0) return { unavailable: "--spacing isn't a length" };
      if (scope === "global") {
        const n = step === undefined ? 0 : Number(step);
        if (n <= 0) return { unavailable: `its ${what} isn't a step of the spacing scale` };
        return {
          label: "--spacing (the whole spacing scale)",
          token: "--spacing",
          valueAt: linear(start, axis, 0),
          at: (v) => {
            const value = rem(Math.max(0.25, v / n));
            return { css: `:root{--spacing:${value}!important}`, commit: tokenCommit("--spacing", value), text: `--spacing: ${value}` };
          },
        };
      }
      const blocked = needsClasses();
      if (blocked) return blocked;
      return {
        label: `${what}: spacing scale`,
        token: null,
        valueAt: linear(start, axis, 0),
        at: (v) => {
          const s = nearest(data.spacingSteps, v / spacing);
          const utility = `${prefix}-${s}`;
          return { css: `${TARGET}{${prop}:${s * spacing}px!important}`, commit: { kind: "class", remove: group, add: utility }, text: utility };
        },
      };
    }
    case "type": {
      const axis = { dx: 0, dy: -1 / 3 };
      const scale = typeScale(data.tokens, m.rem);
      const base = px("--type-base");
      if (scope === "instance") return instance(TEXT_GROUP, "font-size", (v) => `text-[${v}px]`, m.fontSize, axis, 6);
      if (scope === "global") {
        if (base === null || m.fontSize <= 0) return { unavailable: "--type-base isn't a length" };
        return {
          label: "--type-base (the whole type scale)",
          token: "--type-base",
          valueAt: linear(m.fontSize, axis, 6),
          at: (v) => {
            const value = rem(round((base * v) / m.fontSize, 2));
            return { css: `:root{--type-base:${value}!important}`, commit: tokenCommit("--type-base", value), text: `--type-base: ${value}` };
          },
        };
      }
      const blocked = needsClasses();
      if (blocked) return blocked;
      if (scale.length === 0) return { unavailable: "the project has no type scale" };
      const current = scale.reduce((best, s, i) => (Math.abs(s.px - m.fontSize) < Math.abs((scale[best]?.px ?? 0) - m.fontSize) ? i : best), 0);
      return {
        label: "type scale step",
        token: null,
        // Each 12px of vertical drag is one step; the value is the step's size.
        valueAt: (_dx, dy) => scale[clamp(current + Math.round(-dy / 12), 0, scale.length - 1)]?.px ?? m.fontSize,
        at: (v) => {
          const s = scale.find((x) => x.px === v) ?? scale[current];
          const utility = `text-${s?.step ?? "base"}`;
          return { css: `${TARGET}{font-size:${v}px!important}`, commit: { kind: "class", remove: TEXT_GROUP, add: utility }, text: utility };
        },
      };
    }
    case "border": {
      const axis = { dx: 0.25, dy: 0 };
      if (scope === "instance") return instance(BORDER_GROUP, "border-width", (v) => `border-[${v}px]`, m.borderWidth, axis);
      // There are no per-component border widths: plain and Shift both set the token.
      if (!m.classes.some((c) => /^(border|border-[xytrblse])$/.test(c))) return { unavailable: "its border width isn't the token (plain `border`)" };
      return {
        label: "--border-width (every default border)",
        token: "--border-width",
        valueAt: linear(m.borderWidth, axis, 0),
        at: (v) => ({ css: `:root{--border-width:${v}px!important}`, commit: tokenCommit("--border-width", `${v}px`), text: `--border-width: ${v}px` }),
      };
    }
  }
}

/** Every base radius class (uniform or per corner), replaced by an instance radius. */
export const RADIUS_GROUP = "^rounded(-(t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(-[a-z0-9]+|-\\[[^\\]]+\\])?$";
/** Font sizes on the scale, or arbitrary: never colours (`text-primary`). */
export const TEXT_GROUP = "^text-(xs|sm|base|lg|xl|[2-9]xl|\\[\\d[^\\]]*\\])$";
/** Border widths: `border`, `border-2`, `border-[3px]`; never colours (`border-input`). */
export const BORDER_GROUP = "^border(-\\d+|-\\[\\d[^\\]]*\\])?$";

function paddingPrefix(classes: string[], edge: Edge): "p" | "px" | "py" {
  const axis = edge === "left" || edge === "right" ? "px" : "py";
  return classes.some((c) => c.startsWith(`${axis}-`)) ? axis : "p";
}

function tokenCommit(name: string, value: string): GizmoCommit {
  return { kind: "token", name, value };
}

/** `calc(var(--radius) * 0.8)` → 0.8; `var(--radius)` → 1; anything else null. */
export function factorOf(value: string): number | null {
  if (/^var\(\s*--radius\s*\)$/.test(value.trim())) return 1;
  const m = /^calc\(\s*var\(\s*--radius\s*\)\s*\*\s*(\d*\.?\d+)\s*\)$/.exec(value.trim());
  return m ? Number(m[1]) : null;
}

/** The type scale's steps, smallest first: `{ step: "sm", px: 13.33 }`. */
export function typeScale(tokens: GizmoToken[], rem: number): { step: string; px: number }[] {
  const out: { step: string; px: number }[] = [];
  for (const t of tokens) {
    const m = /^--text-(xs|sm|base|lg|xl|[2-9]xl)$/.exec(t.name);
    const px = m ? toPx(t.resolved ?? t.value, rem) : null;
    if (m && px !== null) out.push({ step: m[1] as string, px: round(px, 2) });
  }
  return out.sort((a, b) => a.px - b.px);
}

/** "0.5rem" → 8 (at 16px per rem), "3px" → 3; anything else null. */
export function toPx(value: string | null, rem: number): number | null {
  const m = value === null ? null : /^(-?\d*\.?\d+)(rem|px)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * (m[2] === "rem" ? rem : 1);
}

function linear(start: number, axis: Axis, min: number): (dx: number, dy: number) => number {
  return (dx, dy) => Math.max(min, Math.round(start + dx * axis.dx + dy * axis.dy));
}

function nearest(steps: number[], value: number): number {
  return steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0] ?? 0);
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function cssEscape(s: string): string {
  return s.replace(/[^\w-]/g, (c) => `\\${c}`);
}

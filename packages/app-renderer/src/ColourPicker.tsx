// The colour picker: a colour area, a hue slider, and fields for hex, RGB, HSL and
// opacity. The theme panel opens it from a colour's swatch; the colour panel shows it
// in place. It speaks hex and opacity; callers turn that into the theme's oklch.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { alphaOf, cssToHex, hexToRgb, hslToRgb, hsvToRgb, opacityOf, rgbToHex, rgbToHsl, rgbToHsv } from "./colour.js";
import { copy } from "./copy.js";
import { Tooltip } from "./Tooltip.js";
import { usePopover } from "./TopBar.js";

/** A colour as the picker edits it: hue (0–360), saturation and value (0–100), opacity (0–100). */
interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

function fromCss(css: string): Hsva {
  const hex = cssToHex(css) ?? "#000000";
  const { h, s, v } = rgbToHsv(hexToRgb(hex) ?? { r: 0, g: 0, b: 0 });
  return { h, s, v, a: opacityOf(alphaOf(css)) };
}

const hexOf = (c: Hsva) => rgbToHex(hsvToRgb(c.h, c.s, c.v));

export interface ColourEditorProps {
  /** What's being edited, e.g. "Main colour, light mode": the picker's accessible name. */
  label: string;
  /** The colour now, as any CSS colour. */
  value: string;
  /** Show the opacity field (a colour set on one element has none). */
  opacity?: boolean;
  /** Live, while dragging or typing: preview it. */
  onChange?: (hex: string, opacity: number) => void;
  /** On release, Enter or leaving a field: write it. */
  onCommit: (hex: string, opacity: number) => void;
}

/** The picker itself. */
export function ColourEditor({ label, value, opacity = true, onChange, onCommit }: ColourEditorProps) {
  const [colour, setColour] = useState(() => fromCss(value));
  const dragging = useRef(false);
  // A new value from outside (the file changed) replaces the draft, unless mid-drag.
  useEffect(() => {
    if (!dragging.current) setColour(fromCss(value));
  }, [value]);
  const latest = useRef(colour);
  latest.current = colour;
  const show = (next: Hsva) => {
    setColour(next);
    latest.current = next;
    onChange?.(hexOf(next), next.a);
  };
  const commit = (next: Hsva = latest.current) => onCommit(hexOf(next), next.a);

  const area = useRef<HTMLDivElement>(null);
  const fromPointer = (e: PointerEvent) => {
    const r = area.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    const s = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const v = Math.min(100, Math.max(0, 100 - ((e.clientY - r.top) / r.height) * 100));
    show({ ...latest.current, s, v });
  };
  const onAreaKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const c = latest.current;
    const moves: Record<string, Partial<Hsva>> = {
      ArrowLeft: { s: Math.max(0, c.s - step) },
      ArrowRight: { s: Math.min(100, c.s + step) },
      ArrowUp: { v: Math.min(100, c.v + step) },
      ArrowDown: { v: Math.max(0, c.v - step) },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = { ...c, ...move };
    show(next);
    commit(next);
  };

  const hex = hexOf(colour);
  const rgb = hsvToRgb(colour.h, colour.s, colour.v);
  const hsl = rgbToHsl(rgb);
  const pure = rgbToHex(hsvToRgb(colour.h, 100, 100));
  /** A field's typed value, as a new colour (or null if it isn't one). */
  const setRgb = (key: "r" | "g" | "b") => (n: number) => {
    const { h, s, v } = rgbToHsv({ ...rgb, [key]: n });
    return { h: s === 0 ? colour.h : h, s, v, a: colour.a };
  };
  const setHsl = (key: "h" | "s" | "l") => (n: number) => {
    const next = { ...hsl, [key]: n };
    const { h, s, v } = rgbToHsv(hslToRgb(next.h, next.s, next.l));
    return { h: key === "h" ? n : s === 0 ? colour.h : h, s, v, a: colour.a };
  };
  const field = (key: string, name: string, shown: number, max: number, make: (n: number) => Hsva) => (
    <NumberField key={key} label={name} value={Math.round(shown)} max={max} onCommit={(n) => commit(apply(make(n)))} />
  );
  const apply = (next: Hsva) => {
    show(next);
    return next;
  };

  return (
    <div className="colour-editor" role="group" aria-label={label}>
      <div
        ref={area}
        className="colour-area"
        role="slider"
        tabIndex={0}
        aria-label={copy.colour.area}
        aria-valuetext={copy.colour.areaValue(Math.round(colour.s), Math.round(colour.v))}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          if (!dragging.current) return;
          dragging.current = false;
          commit();
        }}
        onKeyDown={onAreaKey}
      >
        <span className="colour-area-thumb" style={{ left: `${colour.s}%`, top: `${100 - colour.v}%`, background: hex }} />
      </div>
      <input
        type="range"
        className="colour-hue"
        aria-label={copy.colour.hue}
        min={0}
        max={360}
        value={Math.round(colour.h)}
        onChange={(e) => show({ ...latest.current, h: Number(e.target.value) })}
        onPointerUp={() => commit()}
        onKeyUp={(e) => e.key.startsWith("Arrow") && commit()}
      />
      <div className="colour-fields">
        <span className="colour-preview" style={{ background: hex, opacity: colour.a / 100 }} aria-hidden="true" />
        <HexField label={copy.colour.hex} value={hex} onCommit={(next) => commit(apply({ ...rgbToHsvA(next), a: colour.a }))} />
        {opacity && <NumberField label={copy.colour.opacity} value={Math.round(colour.a)} max={100} onCommit={(a) => commit(apply({ ...colour, a }))} />}
      </div>
      <div className="colour-fields">
        {field("r", copy.colour.red, rgb.r, 255, setRgb("r"))}
        {field("g", copy.colour.green, rgb.g, 255, setRgb("g"))}
        {field("b", copy.colour.blue, rgb.b, 255, setRgb("b"))}
      </div>
      <div className="colour-fields">
        {field("h", copy.colour.hueShort, hsl.h, 360, setHsl("h"))}
        {field("s", copy.colour.saturation, hsl.s, 100, setHsl("s"))}
        {field("l", copy.colour.lightness, hsl.l, 100, setHsl("l"))}
      </div>
    </div>
  );
}

function rgbToHsvA(hex: string): Omit<Hsva, "a"> {
  return rgbToHsv(hexToRgb(hex) ?? { r: 0, g: 0, b: 0 });
}

/** A hex field: takes #rrggbb, #rgb, or any colour the browser knows (e.g. "teal"). Edits on Enter or leaving it. */
function HexField({ label, value, onCommit }: { label: string; value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = () => {
    const t = draft.trim();
    const hex = hexToRgb(t) ? rgbToHex(hexToRgb(t) as { r: number; g: number; b: number }) : t ? cssToHex(t) : null;
    if (hex && hex !== value) onCommit(hex);
    else setDraft(value);
  };
  return (
    <label className="colour-field colour-field-hex">
      <span>{label}</span>
      <input
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setDraft(value);
        }}
      />
    </label>
  );
}

/** A whole number from 0 to `max`. Edits on Enter or leaving it; the arrow keys step it. */
function NumberField({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const done = (text = draft) => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return setDraft(String(value));
    const clamped = Math.min(max, Math.max(0, Math.round(n)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className="colour-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done()}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setDraft(String(value));
        }}
        onKeyUp={(e) => (e.key === "ArrowUp" || e.key === "ArrowDown") && done(e.currentTarget.value)}
      />
    </label>
  );
}

export interface ColourSwatchProps extends Omit<ColourEditorProps, "onChange"> {
  /** Live preview while the picker is open, and null to stop previewing. */
  onPreview?: (hex: string | null, opacity: number) => void;
}

/** A theme colour's swatch: shows the colour, and opens the picker. */
export function ColourSwatch({ label, value, opacity, onPreview, onCommit }: ColourSwatchProps) {
  const pop = usePopover();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // Previewing something not yet written: stop the preview if the picker closes.
  const previewing = useRef(false);
  useLayoutEffect(() => {
    if (!pop.open) {
      if (previewing.current) onPreview?.(null, 100);
      previewing.current = false;
      return;
    }
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 236;
    const height = 330;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 4 + height > window.innerHeight ? Math.max(8, r.top - 4 - height) : r.bottom + 4;
    setAt({ left, top });
    // Only when it opens or closes: onPreview is a new function each render.
  }, [pop.open]);
  return (
    <span className="popover-anchor" ref={pop.box}>
      <Tooltip text={pop.open ? null : label} describe={false}>
        <button
          ref={button}
          type="button"
          className="swatch-button"
          aria-label={label}
          aria-expanded={pop.open}
          aria-haspopup="dialog"
          data-value={value}
          onClick={pop.toggle}
        >
          <span className="swatch" style={{ background: value }} aria-hidden="true" />
          <span className="swatch-hex">{copy.colour.readout(cssToHex(value) ?? "", opacityOf(alphaOf(value)))}</span>
        </button>
      </Tooltip>
      {pop.open && at && (
        <div className="menu colour-popover" role="dialog" aria-label={label} style={{ left: at.left, top: at.top }}>
          <ColourEditor
            label={label}
            value={value}
            {...(opacity === undefined ? {} : { opacity })}
            onChange={(hex, a) => {
              previewing.current = true;
              onPreview?.(hex, a);
            }}
            onCommit={(hex, a) => {
              previewing.current = false;
              onCommit(hex, a);
            }}
          />
        </div>
      )}
    </span>
  );
}

import { useEffect, useState } from "react";
import type { ThemeToken } from "@skeleton/app-main/ipc";
import { alphaFor, COLOUR_PROPERTY, hexToOklch } from "./colour.js";
import { ColourEditor } from "./ColourPicker.js";
import { copy } from "./copy.js";
import { themeName } from "./names.js";
import { IconButton, Tooltip } from "./Tooltip.js";
import { X } from "lucide-react";

export interface ColourChip {
  key: string;
  /** bg, text or border. */
  utility: string;
  token: string;
  /** Alt was held: start on "this element only". */
  alt: boolean;
}

export interface ColourPanelProps {
  chip: ColourChip;
  token: ThemeToken | null;
  /** The mode the canvas shows: token edits write its value (T4.7). */
  dark: boolean;
  /** Why this element's classes can't be edited (no instance colour), or null. */
  classEdits: string | null;
  onPreview: (css: string | null) => void;
  onToken: (value: string) => void;
  onInstance: (utility: string, cls: string) => void;
  onClose: () => void;
}

/**
 * The picker a colour chip opens (T4.3). By default it edits the token for the mode
 * on screen (T4.7); "this element only" writes an arbitrary colour class instead,
 * which is a violation (PRD §10.3). Dragging in the picker previews live (T4.4).
 */
export function ColourPanel({ chip, token, dark, classEdits, onPreview, onToken, onInstance, onClose }: ColourPanelProps) {
  const [instance, setInstance] = useState(chip.alt && classEdits === null);
  useEffect(() => setInstance(chip.alt && classEdits === null), [chip, classEdits]);
  const mode = dark && token?.dark !== null ? "dark" : "light";
  const value = token ? (mode === "dark" ? (token.dark ?? token.value) : token.value) : "";
  const property = COLOUR_PROPERTY[chip.utility] ?? "color";
  const themeValue = (hex: string, opacity: number) => hexToOklch(hex, alphaFor(opacity));
  const previewCss = (hex: string, opacity: number) =>
    instance ? `[data-skeleton-gizmo]{${property}:${hex}!important}` : `:root{${chip.token}:${themeValue(hex, opacity)}!important}`;
  const commit = (hex: string, opacity: number) => {
    if (instance) onInstance(chip.utility, `${chip.utility}-[${hex}]`);
    else onToken(themeValue(hex, opacity));
  };
  return (
    <section aria-label={copy.colour.title} className="colour-panel" data-testid="colour-panel">
      <div className="row">
        <h2>{copy.colour.title}</h2>
        <IconButton className="quiet" icon={X} size={16} label={copy.colour.close} onClick={onClose} />
      </div>
      <p className="muted small">
        {copy.colour.summary(chip.utility, themeName(chip.token))}
      </p>
      <div className="segmented" role="group" aria-label={copy.colour.scope}>
        <Tooltip text={copy.colour.tokenTitle(themeName(chip.token), mode)}>
          <button type="button" aria-pressed={!instance} onClick={() => setInstance(false)}>
            {copy.colour.token(mode)}
          </button>
        </Tooltip>
        <Tooltip text={classEdits ?? copy.colour.instanceTitle}>
          <button type="button" aria-pressed={instance} disabled={classEdits !== null} onClick={() => setInstance(true)}>
            {copy.colour.instance}
          </button>
        </Tooltip>
      </div>
      <ColourEditor
        key={`${chip.key}${chip.utility}${instance}`}
        label={instance ? copy.colour.instance : copy.colour.valueLabel(themeName(chip.token), mode)}
        value={value || "#000000"}
        opacity={!instance}
        onChange={(hex, opacity) => onPreview(previewCss(hex, opacity))}
        onCommit={commit}
      />
      {instance && <p className="muted small">{copy.colour.instanceNote(chip.utility)}</p>}
    </section>
  );
}

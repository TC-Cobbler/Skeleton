import { useEffect, useRef, useState } from "react";
import type { ThemeToken } from "@skeleton/app-main/ipc";
import { alphaOf, COLOUR_PROPERTY, cssToHex, hexToOklch } from "./colour.js";
import { TextInput } from "./PropertiesPanel.js";
import { copy } from "./copy.js";
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
  const hex = cssToHex(value) ?? "#000000";
  const property = COLOUR_PROPERTY[chip.utility] ?? "color";
  const name = chip.token.slice(2);
  const previewCss = (picked: string) =>
    instance ? `[data-skeleton-gizmo]{${property}:${picked}!important}` : `:root{${chip.token}:${hexToOklch(picked, alphaOf(value))}!important}`;
  const commit = (picked: string) => {
    if (instance) onInstance(chip.utility, `${chip.utility}-[${picked}]`);
    else onToken(hexToOklch(picked, alphaOf(value)));
  };
  // React's onChange fires on every input; the native change event is the picker's release.
  const picker = useRef<HTMLInputElement>(null);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const onChange = () => latestCommit.current(input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  });
  return (
    <section aria-label={copy.colour.title} className="colour-panel" data-testid="colour-panel">
      <div className="row">
        <h2>{copy.colour.title}</h2>
        <IconButton className="quiet" icon={X} size={16} label={copy.colour.close} onClick={onClose} />
      </div>
      <p className="muted small">
        {copy.colour.summary(chip.utility, name, chip.token)}
      </p>
      <div className="segmented" role="group" aria-label={copy.colour.scope}>
        <Tooltip text={copy.colour.tokenTitle(chip.token, mode)}>
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
      <div className="row colour-inputs">
        <input
          type="color"
          aria-label={copy.colour.pick}
          defaultValue={hex}
          key={`${chip.key}${chip.utility}${hex}${instance}`}
          ref={picker}
          onInput={(e) => onPreview(previewCss(e.currentTarget.value))}
        />
        {!instance && <TextInput label={copy.colour.valueLabel(chip.token, mode)} value={value} onCommit={(v) => v.trim() !== "" && onToken(v.trim())} />}
      </div>
      {instance && <p className="muted small">{copy.colour.instanceNote(chip.utility)}</p>}
    </section>
  );
}

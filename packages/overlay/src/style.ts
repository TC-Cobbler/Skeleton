// Skeleton's own look (T8.4, docs/ui-refresh-spec.md §3, "Compact pro"): one set of
// values for the renderer's chrome and the overlay's drawing on the canvas. The
// renderer and the overlay's shadow root both get them as CSS custom properties;
// the overlay also uses them directly in what it draws. Dark only. None of this
// ever reaches the user's page styles.

export const STYLE = {
  colour: {
    /** Behind the canvas. */
    surround: "#111111",
    /** Panels, bars and the status bar. */
    panel: "#1B1B1B",
    /** Toolbars, pop-overs and menus. */
    toolbar: "#222222",
    control: "#2C2C2C",
    controlHover: "#393939",
    /** A toggle or tab that's on. */
    controlOn: "#444444",
    separator: "#111111",
    heading: "#F2F2F2",
    text: "#DBDBDB",
    secondary: "#8A8A8A",
    input: "#111111",
    inputBorder: "#444444",
    /** The one blue: selection, focus, the active workspace and Hand off. */
    accent: "#4069FD",
    accentHover: "#5A7DFF",
    /** A selected layer's background: the blue at 16%. */
    selectedRow: "rgb(64 105 253 / 0.16)",
    /** A hovered row. */
    hoverRow: "rgb(255 255 255 / 0.06)",
    /** Agent code: its outlines, labels and badges. */
    agent: "#E8833A",
    /** Notes and their pins. */
    notes: "#C084FC",
    tooltip: "#6D6D6D",
    danger: "#F87171",
    success: "#4ADE80",
    warning: "#FBBF24",
    /** Elements a theme value is used by, while its row is hovered. */
    themeUse: "#2DD4BF",
    white: "#FFFFFF",
  },
  type: {
    font: "ui-sans-serif, system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    body: "12px",
    heading: "10px",
    tab: "11px",
    small: "11px",
  },
  size: {
    bar: "34px",
    control: "24px",
    radius: "3px",
    panel: "260px",
    inspector: "300px",
    focusRing: "2px",
    focusGap: "2px",
  },
} as const;

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every value as a CSS custom property (`--sk-colour-accent`, `--sk-size-bar`, …), declared on `selector`. */
export function styleVariables(selector: string): string {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(STYLE)) {
    for (const [name, value] of Object.entries(values)) lines.push(`--sk-${group}-${kebab(name)}:${value};`);
  }
  return `${selector}{color-scheme:dark;${lines.join("")}}`;
}

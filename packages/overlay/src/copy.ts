/**
 * Every word the overlay shows on the canvas (T8.1, docs/ui-refresh-spec.md §5).
 * The overlay never imports from the host, so it keeps its own copy file; the
 * plain-words check reads this one too.
 */

const plural = (n: number, word: string, many = `${word}s`) => (n === 1 ? word : many);

/** "Button" → "All buttons"; "Box" → "All boxes". */
const all = (kind: string) => {
  const k = kind.charAt(0).toLowerCase() + kind.slice(1);
  return `All ${/(s|x|ch|sh)$/.test(k) ? `${k}es` : `${k}s`}`;
};

export const copy = {
  overlay: {
    textOf: (label: string) => `Text of ${label}`,
    dragToMove: "Drag to move",
    dropBeside: (side: "before" | "after", beside: string, parent: string) => `${side === "before" ? "before" : "after"} ${beside} in ${parent}`,
    dropInto: (parent: string) => `into ${parent}`,
    /** A drop label: the place, capitalised. */
    drop: (where: string) => where.charAt(0).toUpperCase() + where.slice(1),
    move: (label: string, where: string) => `Move ${label} ${where}`,
    pinNotes: (open: number, total: number) => `${open} open of ${total} ${plural(total, "note")}`,
    pinReplied: "the agent replied",
    /** Agent code's label: its element name with the agent code mark. */
    agentLabel: (label: string) => `🔒 ${label}`,
  },
  /** Handle hovers and readouts: the reach (spec: All buttons, Whole theme, Just this one) and theme value names. */
  gizmos: {
    hover: (what: string) => what,
    dragging: (readout: string, affected: string) => `${readout} · ${affected}`,
    thisElement: "this element",
    elements: (n: number) => `${n} ${plural(n, "element")}`,
    readout: (name: string, value: string) => `${name}: ${value}`,
    px: (value: number) => `${Math.round(value * 10) / 10}px`,
    /** A colour chip: what the colour is used for, and its theme value name. */
    chip: (utility: string, name: string) => `${({ bg: "Background", text: "Text", border: "Border" } as Record<string, string>)[utility] ?? "Colour"}: ${name}`,
    instance: "Just this one",
    radiusGlobal: (name: string) => `Whole theme: ${name}, which every corner follows`,
    radiusComponent: (name: string, kind: string) => `${all(kind)}: ${name}`,
    spacingGlobal: (name: string) => `Whole theme: ${name}, which all spacing follows`,
    spacingComponent: (what: string) => `Just this one: its ${what}, in theme sizes`,
    typeGlobal: (name: string) => `Whole theme: ${name}, which all text sizes follow`,
    typeComponent: "Just this one: its text size, in theme sizes",
    borderGlobal: (name: string) => `Whole theme: ${name}, which every line follows`,
    /** What a spacing handle changes. */
    spacingWhat: { gap: "space between items", padding: "inner space" },
    notLength: (name: string) => `Can't drag this: ${name} isn't a size Skeleton can change by dragging.`,
    noRadiusToken: (kind: string) => `Can't drag this for ${all(kind).toLowerCase()}: they have no corners of their own in the theme. Hold Shift for the whole theme, or Alt for just this one.`,
    notSpacingStep: (what: string) => `Can't drag this: its ${what} is a custom size, not a theme size. Pick a theme size first.`,
    noTypeScale: "Can't drag this: your app's theme has no text sizes.",
    borderNotThemed: "Can't drag this: its line thickness is set by hand, not by the theme.",
  },
};

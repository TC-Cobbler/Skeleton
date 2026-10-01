/**
 * Every word the overlay shows on the canvas (T8.1, docs/ui-refresh-spec.md §5).
 * The overlay never imports from the host, so it keeps its own copy file; the
 * plain-words check reads this one too.
 */

const plural = (n: number, word: string, many = `${word}s`) => (n === 1 ? word : many);

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
    pinReplied: "agent replied",
    /** How a locked block without an element of its own is labelled. */
    lockedKinds: { map: ".map()", conditional: "conditional", expression: "{…}", fragment: "<>…</>", spread: "{...}" } as Record<string, string>,
    lockedLabel: (name: string, id: string) => `🔒 ${name}${id}`,
  },
  gizmos: {
    /** How the hover label names each scope (PRD §10.3). */
    scopes: { component: "Drag", global: "Shift", instance: "Alt" },
    hover: (scope: string, what: string) => `${scope}: ${what}`,
    hoverRefusal: (reason: string) => `can't: ${reason}`,
    refusal: (reason: string) => `Can't: ${reason}`,
    dragging: (readout: string, affected: string) => `${readout} · ${affected}`,
    thisElement: "this element",
    elements: (n: number) => `${n} ${plural(n, "element")}`,
    readout: (name: string, value: string) => `${name}: ${value}`,
    instance: "this element only",
    notLength: (token: string) => `${token} isn't a length`,
    radiusGlobal: "--radius (every radius derived from it)",
    noRadiusToken: "it has no radius token (rounded-button, rounded-card…)",
    radiusComponent: (token: string, own: string | undefined) => `${token} (every ${own})`,
    notSpacingStep: (what: string) => `its ${what} isn't a step of the spacing scale`,
    spacingGlobal: "--spacing (the whole spacing scale)",
    spacingComponent: (what: string) => `${what}: spacing scale`,
    typeGlobal: "--type-base (the whole type scale)",
    noTypeScale: "the project has no type scale",
    typeComponent: "type scale step",
    borderNotToken: "its border width isn't the token (plain `border`)",
    borderGlobal: "--border-width (every default border)",
  },
};

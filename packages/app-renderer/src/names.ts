// What things are called on screen (T8.8, docs/ui-refresh-spec.md §6): theme values,
// settings and their options, agent controls, and elements, by the name tables in the
// copy file, with a fallback rule for anything they don't list. Never a code name.

import type { UiNode } from "@skeleton/app-main/ipc";
import { copy } from "./copy.js";

const n = copy.names;

/** "brand-teal" → "Brand teal"; "maxLength" → "Max length". */
export function words(code: string): string {
  const spaced = code
    .replace(/^--/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A theme value by its theme value name: "--primary" → "Main colour", "--radius-chip" → "Chip corners". */
export function themeName(css: string): string {
  const listed = n.theme[css];
  if (listed) return listed;
  const name = css.replace(/^--/, "");
  if (name.startsWith("radius-")) return n.themeFallback.corners(words(name.slice("radius-".length)));
  if (name.startsWith("text-")) return n.themeFallback.text(words(name.slice("text-".length)));
  return words(name.replace(/^color-/, ""));
}

/** Whether a setting is shown at all (asChild isn't). */
export const settingShown = (prop: string): boolean => !n.hiddenSettings.includes(prop);

/** A setting's label on an element: "variant" → "Style", Switch's "defaultChecked" → "Starts on". */
export function settingLabel(prop: string, element?: string): string {
  return (element ? n.settingsFor[element]?.[prop] : undefined) ?? n.settings[prop] ?? words(prop);
}

/** An option of a setting: Button "variant" "destructive" → "Danger". */
export function optionLabel(prop: string, option: string, element?: string): string {
  return (element ? n.optionsFor[element]?.[prop]?.[option] : undefined) ?? n.options[prop]?.[option] ?? words(option);
}

/** A layout setting, by the palette's label for it: "Gap" → "Space between items". */
export const layoutLabel = (label: string): string => n.layout[label] ?? label;

/** An option of a layout setting: "—" → "Not set", "Center" → "Centre"; numbers stay. */
export const layoutOptionLabel = (label: string): string => n.layoutOptions[label] ?? label;

/** Whether an agent control is shown at all (key and ref aren't). */
export const agentControlShown = (prop: string): boolean => !n.hiddenControls.includes(prop);

/** What the agent's code decides, in plain words: "onClick" → "What happens on click". */
export function agentControlName(prop: string): string {
  const listed = n.agentControls[prop];
  if (listed) return listed;
  if (/^on[A-Z]/.test(prop)) return n.agentControlOn(words(prop.slice(2)).toLowerCase());
  return words(prop);
}

/** The kind of an element, in plain words: a Column, a Text field, a Repeated list… */
export function elementKind(node: Pick<UiNode, "name" | "kind" | "element" | "lockReason" | "props">): string {
  if (node.kind === "locked" && !node.element) return n.agentKinds[node.name] ?? words(node.name);
  if (node.kind === "locked" && node.lockReason === "custom component") return n.agentComponent(node.name);
  if (node.kind === "locked") return n.agentElement;
  if (node.name === "Stack") return node.props["direction"] === "horizontal" ? n.row : n.column;
  return n.elements[node.name] ?? partName(node.name);
}

/** A component part not in the table: "CardHeader" → "Card header". */
function partName(name: string): string {
  return /^[A-Z]/.test(name) ? words(name) : name;
}

/** An element's element name: its kind, plus its text when that tells it apart (Button "Add game"). */
export function elementName(node: Pick<UiNode, "name" | "kind" | "element" | "lockReason" | "props" | "text">): string {
  const kind = elementKind(node);
  const text = node.text?.trim();
  return text && text.length <= 40 ? n.withText(kind, text) : kind;
}

/** A palette group's name, by its id: "overlay" → "Overlays". */
export const paletteGroup = (id: string, label: string): string => copy.palette.groups[id] ?? label;

/** A palette entry's name, by its id: "stack-vertical" → "Column". */
export const paletteItem = (id: string, label: string): string => copy.palette.items[id]?.[0] ?? label;

/** What a palette entry is for, by its id. */
export const paletteDescription = (id: string, description: string): string => copy.palette.items[id]?.[1] ?? description;

/** An element's kind from its code name alone, when there's no node to read (the agent's work). */
export function kindOf(name: string): string {
  if (name === "Stack") return n.stack;
  return n.elements[name] ?? partName(name);
}

/** Agent code from its code name and why it's agent code, when there's no node to read. */
export function agentCodeKind(name: string, lockReason: string | null): string {
  if (n.agentKinds[name]) return n.agentKinds[name];
  if (lockReason === "custom component") return n.agentComponent(name);
  return n.agentElement;
}

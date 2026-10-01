import { describe, expect, it } from "vitest";
import type { UiNode } from "@skeleton/app-main/ipc";
import {
  agentControlName,
  agentControlShown,
  elementKind,
  elementName,
  layoutLabel,
  layoutOptionLabel,
  optionLabel,
  settingLabel,
  settingShown,
  themeName,
  words,
} from "../src/names.js";

type Named = Pick<UiNode, "name" | "kind" | "element" | "lockReason" | "props" | "text">;
const node = (over: Partial<Named>): Named => ({ name: "div", kind: "plain", element: true, lockReason: null, props: {}, text: null, ...over });

describe("names (spec §6)", () => {
  it("turns code names into words", () => {
    expect(words("brand-teal")).toBe("Brand teal");
    expect(words("maxLength")).toBe("Max length");
    expect(words("--color-brand_teal")).toBe("Color brand teal");
  });

  it("names theme values by the table, then by the fallback rule", () => {
    expect(themeName("--primary")).toBe("Main colour");
    expect(themeName("--radius-chip")).toBe("Chip corners");
    expect(themeName("--text-huge")).toBe("Huge text");
    expect(themeName("--color-brand-teal")).toBe("Brand teal");
  });

  it("labels settings and options, by element where they differ", () => {
    expect(settingLabel("variant")).toBe("Style");
    expect(settingLabel("defaultChecked", "Switch")).toBe("Starts on");
    expect(settingLabel("defaultChecked", "Checkbox")).toBe("Starts ticked");
    expect(settingLabel("maxLength")).toBe("Max length");
    expect(optionLabel("variant", "destructive", "Button")).toBe("Danger");
    expect(optionLabel("type", "submit", "Button")).toBe("Sends the form");
    expect(optionLabel("variant", "line", "TabsList")).toBe("Underlined");
    expect(optionLabel("variant", "brand")).toBe("Brand");
    expect(settingShown("asChild")).toBe(false);
    expect(settingShown("variant")).toBe(true);
  });

  it("labels layout settings and options", () => {
    expect(layoutLabel("Gap")).toBe("Space between items");
    expect(layoutLabel("Unknown")).toBe("Unknown");
    expect(layoutOptionLabel("—")).toBe("Not set");
    expect(layoutOptionLabel("4")).toBe("4");
  });

  it("names agent controls, and hides key and ref", () => {
    expect(agentControlName("onClick")).toBe("What happens on click");
    expect(agentControlName("onMouseEnter")).toBe("What happens on mouse enter");
    expect(agentControlName("tabIndex")).toBe("Tab index");
    expect(agentControlShown("key")).toBe(false);
    expect(agentControlShown("onClick")).toBe(true);
  });

  it("names element kinds", () => {
    expect(elementKind(node({ name: "Stack", kind: "primitive" }))).toBe("Column");
    expect(elementKind(node({ name: "Stack", kind: "primitive", props: { direction: "horizontal" } }))).toBe("Row");
    expect(elementKind(node({ name: "Input", kind: "palette" }))).toBe("Text field");
    expect(elementKind(node({ name: "CardHeader", kind: "palette" }))).toBe("Card header");
    expect(elementKind(node({ name: "h1" }))).toBe("Heading");
    expect(elementKind(node({ name: "map", kind: "locked", element: false, lockReason: ".map() loop" }))).toBe("Repeated list");
    expect(elementKind(node({ name: "GameCard", kind: "locked", lockReason: "custom component" }))).toBe("Agent component: GameCard");
    expect(elementKind(node({ name: "motion.div", kind: "locked", lockReason: "member or namespaced element" }))).toBe("Agent element");
  });

  it("adds short text to an element name", () => {
    expect(elementName(node({ name: "Button", kind: "palette", text: "Add game" }))).toBe('Button "Add game"');
    expect(elementName(node({ name: "p", text: "x".repeat(41) }))).toBe("Text");
    expect(elementName(node({ name: "div" }))).toBe("Box");
  });
});

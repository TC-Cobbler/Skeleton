import { describe, expect, it } from "vitest";
import { buildTree, fillMissingIds, insert, parseJsxExpression, walkTree, type UiNode } from "@skeleton/core";
import {
  ELEMENTS,
  PALETTE,
  PALETTE_GROUPS,
  PLAIN_ELEMENTS,
  loadTemplate,
  moduleFile,
  renderProject,
  templateComponents,
  templateFiles,
  templateImports,
} from "../src/index.js";

const template = loadTemplate();
const placeable = PALETTE.filter((p): p is typeof p & { template: string } => p.template !== null);

describe("palette catalogue (T3.1)", () => {
  it("covers PRD §9.1 in its five groups, with unique IDs", () => {
    const labels = PALETTE.map((p) => p.label);
    for (const label of [
      "Stack (vertical)", "Stack (horizontal)", "Grid", "Container", "Spacer",
      "Button", "Input", "Textarea", "Select", "Checkbox", "Switch", "Form",
      "Card", "Badge", "Avatar", "Table", "Tabs", "Separator",
      "Dialog", "Sheet", "Dropdown Menu", "Toast",
      "Sidebar",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(new Set(PALETTE.map((p) => p.id)).size).toBe(PALETTE.length);
    for (const group of PALETTE_GROUPS) expect(PALETTE.some((p) => p.group === group.id), group.id).toBe(true);
  });

  it("gives every unplaceable entry a note saying what to do instead", () => {
    for (const item of PALETTE.filter((p) => p.template === null)) expect(item.note, item.id).toBeTruthy();
  });

  it("has templates that are one JSX element each, with no IDs yet", () => {
    for (const item of placeable) {
      expect(() => parseJsxExpression(item.template), item.id).not.toThrow();
      expect(item.template, item.id).not.toContain("data-ui-id");
    }
  });

  it("has a schema for every component a template uses, and only plain elements it knows", () => {
    for (const item of placeable) {
      expect(() => templateImports(item.template), item.id).not.toThrow();
      for (const m of item.template.matchAll(/<([a-z][a-z0-9]*)[\s/>]/g)) {
        expect(PLAIN_ELEMENTS, `${item.id}: <${m[1]}>`).toHaveProperty(m[1] as string);
      }
    }
  });

  it("has a schema only for elements a template uses (so every schema is typechecked)", () => {
    const used = new Set(placeable.flatMap((p) => templateComponents(p.template)));
    expect(Object.keys(ELEMENTS).filter((name) => !used.has(name))).toEqual([]);
  });

  it("points every element at a template file that exports it", () => {
    for (const schema of Object.values(ELEMENTS)) {
      const source = template[moduleFile(schema.from)];
      expect(source, `${schema.name}: ${moduleFile(schema.from)}`).toBeDefined();
      expect(source, schema.name).toMatch(new RegExp(`\\b${schema.name}\\b[,\\s}]`));
    }
  });

  it("has well-formed prop schemas", () => {
    for (const schema of Object.values(ELEMENTS)) {
      const names = schema.props.map((p) => p.name);
      expect(new Set(names).size, schema.name).toBe(names.length);
      for (const prop of schema.props) {
        expect(prop.name, schema.name).not.toMatch(/^(className|style|key|ref|children|data-ui-id|on[A-Z].*)$/);
        if (prop.type === "enum") expect(prop.options, `${schema.name}.${prop.name}`).toContain(prop.default);
      }
    }
  });

  it("uses each element the way its schema says: self-closing, text or nodes", () => {
    for (const item of placeable) {
      const root = parseJsxExpression(item.template);
      const check = (el: typeof root) => {
        const name = el.openingElement.name.type === "JSXIdentifier" ? el.openingElement.name.name : "";
        const children = ELEMENTS[name]?.children ?? PLAIN_ELEMENTS[name]?.children;
        const kids = el.children.filter((c) => !(c.type === "JSXText" && c.value.trim() === ""));
        if (children === "none") expect(kids, `${item.id}: <${name}>`).toEqual([]);
        if (children === "text") expect(kids.every((c) => c.type === "JSXText"), `${item.id}: <${name}>`).toBe(true);
        for (const kid of kids) if (kid.type === "JSXElement") check(kid);
      };
      check(root);
    }
  });

  it("lists the files each template needs", () => {
    const card = placeable.find((p) => p.id === "card");
    expect(templateFiles(card?.template ?? "")).toEqual(["src/components/ui/card.tsx"]);
    const form = placeable.find((p) => p.id === "form");
    expect(templateFiles(form?.template ?? "").sort()).toEqual([
      "src/components/layout/index.ts",
      "src/components/ui/button.tsx",
      "src/components/ui/input.tsx",
      "src/components/ui/label.tsx",
    ]);
    expect(templateComponents(`<Stack><Stack /><Button /></Stack>`)).toEqual(["Stack", "Button"]);
  });

  it("places into a fresh page as fully editable, ID'd elements", () => {
    const files = renderProject(template, { name: "Palette", skeletonVersion: "0" });
    const home = files["src/pages/HomePage.tsx"] as string;
    const stackId = /<Stack data-ui-id="(ui_[a-z0-9]{5})"/.exec(home)?.[1] as string;
    const taken = new Set<string>();
    for (const item of placeable) {
      const jsx = fillMissingIds(item.template, taken);
      const { source } = insert(home, stackId, 1, jsx, { imports: templateImports(jsx) });
      const inserted: UiNode[] = [];
      walkTree(buildTree(source).roots, (n) => {
        if (n.range.startLine > 8) inserted.push(n);
      });
      expect(inserted.length, item.id).toBeGreaterThan(0);
      for (const n of inserted) {
        expect(n.kind, `${item.id}: <${n.name}>`).not.toBe("locked");
        expect(n.id, `${item.id}: <${n.name}>`).toMatch(/^ui_[a-z0-9]{5}$/);
        expect(n.protectedProps, `${item.id}: <${n.name}>`).toEqual([]);
      }
    }
  });
});

// Every palette template, and every value its prop schemas allow, typechecks against
// the vendored components in a real, installed project (T3.1). Enum options that a
// component doesn't accept, or props it doesn't have, fail `tsc` here.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fillMissingIds, insert, setProp, type PropValue } from "@skeleton/core";
import { ELEMENTS, PALETTE, loadTemplate, renderProject, templateComponents, templateImports, type PropSchema } from "../src/index.js";

const root = mkdtempSync(path.join(tmpdir(), "skeleton-palette-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PAGE = `import { Stack } from "@/components/layout";

export default function Page() {
  return <Stack data-ui-id="ui_root0" />;
}
`;

function samples(prop: PropSchema): PropValue[] {
  switch (prop.type) {
    case "enum":
      return [...prop.options];
    case "boolean":
      return [true, false];
    case "string":
      return ["Sample"];
    case "number":
      return [prop.min ?? 1];
  }
}

describe("palette templates in a real project (T3.1)", () => {
  it("typecheck, with every schema prop value", () => {
    const files = renderProject(loadTemplate(), { name: "Palette Check", skeletonVersion: "0" });
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), content);
    }
    execFileSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-workspace"], { cwd: root, stdio: "pipe" });

    const taken = new Set<string>(["ui_root0"]);
    const placeable = PALETTE.flatMap((p) => (p.template ? [p.template] : []));
    const place = (page: string, template: string): { page: string; jsx: string } => {
      const jsx = fillMissingIds(template, taken);
      return { page: insert(page, "ui_root0", 0, jsx, { imports: templateImports(jsx) }).source, jsx };
    };

    // One page with every template as placed.
    let all = PAGE;
    for (const t of placeable) all = place(all, t).page;

    // One page per element: a fresh copy of a template that uses it per prop value.
    const pages: Record<string, string> = { "PaletteAll.tsx": all };
    let checked = 0;
    for (const schema of Object.values(ELEMENTS)) {
      const host = placeable.find((t) => templateComponents(t).includes(schema.name));
      expect(host, `no template uses <${schema.name}>`).toBeDefined();
      let page = PAGE;
      for (const prop of schema.props) {
        for (const value of samples(prop)) {
          const placed = place(page, host as string);
          const id = new RegExp(`<${schema.name} data-ui-id="(ui_[a-z0-9]{5})"`).exec(placed.jsx)?.[1] as string;
          page = setProp(placed.page, id, prop.name, value).source;
          checked++;
        }
      }
      pages[`Palette${schema.name}.tsx`] = page;
    }
    expect(checked).toBeGreaterThan(100);

    mkdirSync(path.join(root, "src/pages/palette"), { recursive: true });
    for (const [name, source] of Object.entries(pages)) writeFileSync(path.join(root, "src/pages/palette", name), source);
    try {
      execFileSync("pnpm", ["exec", "tsc", "-b"], { cwd: root, encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      const out = err as { stdout?: string; stderr?: string };
      throw new Error(`tsc failed:\n${out.stdout ?? ""}${out.stderr ?? ""}`);
    }
  }, 180_000);
});

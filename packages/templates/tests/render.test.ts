import { describe, expect, it } from "vitest";
import { analyseTakeBack, buildIdIndex, buildTree, readTokens, walkTree } from "@skeleton/core";
import { loadTemplate, packageNameFor, projectNameError, renderProject } from "../src/index.js";

const template = loadTemplate();
const render = (name = "Gaming Library") => renderProject(template, { name, skeletonVersion: "1.2.3" });

describe("loadTemplate", () => {
  it("contains the scaffold PRD §8 describes", () => {
    const paths = Object.keys(template);
    for (const p of [
      ".gitignore", "package.json", "pnpm-lock.yaml", "index.html", "vite.config.ts",
      "src/main.tsx", "src/router.tsx", "src/pages/HomePage.tsx", "src/styles/globals.css",
      "src/components/layout/index.ts", "skeleton/config.json", "skeleton/notes.json",
      "PRD.md", "ROADMAP.md", "CLAUDE.md", "TASKS.md", "HANDOFF.md",
    ]) {
      expect(paths, p).toContain(p);
    }
    expect(paths.filter((p) => p.startsWith("src/components/ui/"))).toHaveLength(21);
    expect(paths).not.toContain("gitignore");
  });
});

describe("renderProject", () => {
  const files = render();

  it("leaves no placeholders", () => {
    for (const [path, content] of Object.entries(files)) {
      expect(content, path).not.toMatch(/\{\{(name|packageName|skeletonVersion|id:[a-z]+)\}\}/);
    }
  });

  it("fills in names and versions", () => {
    expect(JSON.parse(files["package.json"] as string).name).toBe("gaming-library");
    expect(JSON.parse(files["skeleton/config.json"] as string)).toMatchObject({ name: "Gaming Library", skeletonVersion: "1.2.3" });
    expect(files["index.html"]).toContain("<title>Gaming Library</title>");
    expect(files["PRD.md"]).toMatch(/^# PRD: Gaming Library/);
  });

  it("mints unique, well-formed IDs, fresh per project", () => {
    const tsx = Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith(".tsx")));
    const index = buildIdIndex(tsx);
    expect(index.duplicates).toEqual([]);
    expect(index.malformed).toEqual([]);
    expect(index.ids.size).toBe(3);
    const again = buildIdIndex({ home: render()["src/pages/HomePage.tsx"] as string });
    expect([...again.ids.keys()]).not.toEqual([...index.ids.keys()]);
  });

  it("gives an empty home page that is fully editable", () => {
    const tree = buildTree(files["src/pages/HomePage.tsx"] as string);
    const kinds: string[] = [];
    walkTree(tree.roots, (n) => kinds.push(`${n.kind}:${n.name}:${n.id ? "id" : "none"}`));
    expect(kinds).toEqual(["primitive:Container:id", "primitive:Stack:id", "plain:h1:id"]);
  });

  it("has the full v1 token set (PRD §10.1)", () => {
    const tokens = readTokens(files["src/styles/globals.css"] as string);
    const has = (name: string, block: string) => tokens.some((t) => t.name === name && t.block === block);
    for (const base of ["--radius", "--type-base", "--type-ratio", "--border-width"]) expect(has(base, "light"), base).toBe(true);
    for (const c of ["background", "foreground", "primary", "secondary", "muted", "accent", "destructive", "border", "input", "ring", "card", "popover", "sidebar"]) {
      expect(has(`--${c}`, "light"), c).toBe(true);
      expect(has(`--${c}`, "dark"), c).toBe(true);
    }
    for (const r of ["button", "input", "card", "dialog", "popover", "badge"]) {
      expect(tokens.find((t) => t.name === `--radius-${r}`)?.value, r).toMatch(/var\(--radius\)/);
    }
    for (const size of ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"]) {
      expect(tokens.find((t) => t.name === `--text-${size}`)?.value, size).toMatch(/var\(--type-base\)/);
    }
    expect(has("--spacing", "theme")).toBe(true);
    expect(has("--font-sans", "theme") && has("--font-mono", "theme")).toBe(true);
    expect(tokens.find((t) => t.name === "--default-border-width")?.value).toBe("var(--border-width)");
  });

  it("starts with no contract violations or locked blocks", () => {
    const report = analyseTakeBack({}, files);
    expect(report.newViolations).toEqual([]);
    expect(report.newLockedBlocks).toEqual([]);
    expect(report.unIdedEditable).toEqual([]);
    expect(report.parseErrors).toEqual([]);
  });

  it("imports only project files and declared dependencies", () => {
    const pkg = JSON.parse(files["package.json"] as string) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
    for (const [path, content] of Object.entries(files)) {
      if (!/\.(tsx?|css)$/.test(path)) continue;
      for (const m of content.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
        const raw = m[1] as string;
        if (raw.startsWith(".") || raw.startsWith("@/") || raw.startsWith("node:")) continue;
        const spec = raw.startsWith("@") ? raw.split("/").slice(0, 2).join("/") : (raw.split("/")[0] as string);
        expect(declared.has(spec), `${path} imports ${spec}`).toBe(true);
      }
    }
  });

  it("ships the round-trip contract as CLAUDE.md", () => {
    expect(files["CLAUDE.md"]).toContain("## Round-trip contract");
    expect(files["CLAUDE.md"]).toContain("Never remove or change a `data-ui-id`");
    expect(files["CLAUDE.md"]).toContain("`Stack`, `Grid`, `Container` and `Spacer`");
  });

  it("refuses unusable names", () => {
    expect(() => render("")).toThrow(/invalid project name/);
    expect(() => render("<script>")).toThrow(/invalid project name/);
    expect(() => render("{x}")).toThrow(/invalid project name/);
  });
});

describe("project names", () => {
  it("validates and slugs names", () => {
    expect(projectNameError("Gaming Library")).toBeNull();
    expect(projectNameError("Bob's app v2.0")).toBeNull();
    expect(projectNameError(" padded")).toMatch(/space/);
    expect(projectNameError("a/b")).toMatch(/Use 1–64/);
    expect(projectNameError("x".repeat(65))).toMatch(/Use 1–64/);
    expect(packageNameFor("Bob's App v2.0")).toBe("bob-s-app-v2-0");
  });
});

import postcss, { type AtRule, type Container, type Declaration, type Rule } from "postcss";

/**
 * Where a token lives in globals.css:
 * - `light`: `:root { ... }`, the light-mode value of a colour/base token
 * - `dark`: `.dark { ... }`, the dark-mode value
 * - `theme`: `@theme { ... }`
 * - `theme-inline`: `@theme inline { ... }` (derived tokens, e.g. `--radius-card`)
 */
export type TokenBlock = "light" | "dark" | "theme" | "theme-inline";

export interface Token {
  name: string;
  value: string;
  block: TokenBlock;
}

export interface TokenUpdate {
  name: string;
  value: string;
  /** Required when the name exists in more than one block, or when creating. */
  block?: TokenBlock;
  /** Create the token in `block` if it doesn't exist. */
  create?: boolean;
}

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export function readTokens(css: string): Token[] {
  const tokens: Token[] = [];
  for (const { block, container } of tokenBlocks(postcss.parse(css))) {
    container.each((node) => {
      if (node.type === "decl" && node.prop.startsWith("--")) tokens.push({ name: node.prop, value: node.value, block });
    });
  }
  return tokens;
}

/**
 * Apply token updates. Only the targeted declarations change; every other
 * byte of the file is preserved.
 */
export function writeTokens(css: string, updates: TokenUpdate[]): string {
  const root = postcss.parse(css);
  const blocks = tokenBlocks(root);
  for (const update of updates) {
    if (!update.name.startsWith("--")) throw new TokenError(`token "${update.name}" must start with --`);
    if (/[;{}]/.test(update.value) || update.value.trim() === "") {
      throw new TokenError(`invalid value for ${update.name}: ${JSON.stringify(update.value)}`);
    }
    const matches: { block: TokenBlock; decl: Declaration }[] = [];
    for (const { block, container } of blocks) {
      if (update.block && update.block !== block) continue;
      container.each((node) => {
        if (node.type === "decl" && node.prop === update.name) matches.push({ block, decl: node });
      });
    }
    if (matches.length > 1) {
      const where = matches.map((m) => m.block).join(", ");
      throw new TokenError(`${update.name} is defined in several blocks (${where}); specify block`);
    }
    const match = matches[0];
    if (match) {
      match.decl.value = update.value;
      continue;
    }
    if (!update.create) throw new TokenError(`${update.name} not found${update.block ? ` in ${update.block}` : ""}`);
    if (!update.block) throw new TokenError(`creating ${update.name} requires a block`);
    const target = blocks.find((b) => b.block === update.block);
    if (!target) throw new TokenError(`globals.css has no ${update.block} block`);
    appendDecl(target.container, update.name, update.value);
  }
  return root.toString();
}

function tokenBlocks(root: postcss.Root): { block: TokenBlock; container: Rule | AtRule }[] {
  const out: { block: TokenBlock; container: Rule | AtRule }[] = [];
  root.each((node) => {
    if (node.type === "rule") {
      if (node.selector.trim() === ":root") out.push({ block: "light", container: node });
      else if (node.selector.trim() === ".dark") out.push({ block: "dark", container: node });
    } else if (node.type === "atrule" && node.name === "theme") {
      const params = node.params.trim();
      if (params === "") out.push({ block: "theme", container: node });
      else if (params === "inline") out.push({ block: "theme-inline", container: node });
    }
  });
  return out;
}

function appendDecl(container: Container, prop: string, value: string): void {
  let last: Declaration | undefined;
  container.each((node) => {
    if (node.type === "decl") last = node;
  });
  const decl = postcss.decl({ prop, value });
  if (last) {
    decl.raws.before = (last.raws.before ?? "\n  ").replace(/^\n{2,}/, "\n");
    decl.raws.between = last.raws.between ?? ": ";
    last.after(decl);
  } else {
    decl.raws.before = "\n  ";
    decl.raws.between = ": ";
    container.append(decl);
  }
}

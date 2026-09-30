import * as t from "@babel/types";
import { parseModule } from "./parse.js";

/** Names a module exports (value exports only; `export default` is "default"). */
export function exportedNames(source: string): string[] {
  const names: string[] = [];
  for (const stmt of parseModule(source).program.body) {
    if (t.isExportDefaultDeclaration(stmt)) names.push("default");
    if (!t.isExportNamedDeclaration(stmt) || stmt.exportKind === "type") continue;
    const decl = stmt.declaration;
    if ((t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id) names.push(decl.id.name);
    if (t.isVariableDeclaration(decl)) {
      for (const d of decl.declarations) if (t.isIdentifier(d.id)) names.push(d.id.name);
    }
    for (const spec of stmt.specifiers) {
      if (t.isExportSpecifier(spec) && spec.exportKind !== "type") {
        names.push(t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value);
      }
    }
  }
  return names;
}

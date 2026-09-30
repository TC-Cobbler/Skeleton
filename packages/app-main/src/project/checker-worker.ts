// Typecheck worker (T3.7). Holds TypeScript's incremental builder program for one
// project, so a check after an edit only re-checks what the edit affects (~0.1–0.4 s
// after a ~3 s warm-up). Runs in a worker thread so the warm-up never blocks main.
// Uses the project's own TypeScript and tsconfig, as `pnpm typecheck` would.

import { createRequire } from "node:module";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import type * as TS from "typescript";
import type { CheckRequest, CheckResponse, Diagnostic } from "./checker.js";

const projectRoot = (workerData as { projectRoot: string }).projectRoot;
let ts: typeof TS | null = null;
let unavailable: string | null = null;
try {
  ts = createRequire(path.join(projectRoot, "package.json"))("typescript") as typeof TS;
} catch (error) {
  unavailable = `TypeScript isn't installed in the project: ${error instanceof Error ? error.message : String(error)}`;
}

const cache = new Map<string, { text: string; file: TS.SourceFile }>();
let versions = 0;
let builder: TS.SemanticDiagnosticsBuilderProgram | undefined;

function configPath(sys: typeof TS.sys): string {
  const app = path.join(projectRoot, "tsconfig.app.json");
  return sys.fileExists(app) ? app : path.join(projectRoot, "tsconfig.json");
}

function check(t: typeof TS): Diagnostic[] {
  const parsed = t.getParsedCommandLineOfConfigFile(configPath(t.sys), {}, {
    ...t.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(t.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (!parsed) throw new Error("couldn't read the project's tsconfig");
  const host = t.createCompilerHost(parsed.options);
  // Reuse parsed files whose text hasn't changed, so the builder sees them as unchanged.
  host.getSourceFile = (fileName, languageVersion) => {
    const text = t.sys.readFile(fileName);
    if (text === undefined) return undefined;
    const hit = cache.get(fileName);
    if (hit && hit.text === text) return hit.file;
    const file = t.createSourceFile(fileName, text, languageVersion, true);
    // The builder compares versions to find what changed; a new text is a new version.
    (file as TS.SourceFile & { version: string }).version = String(++versions);
    cache.set(fileName, { text, file });
    return file;
  };
  builder = t.createSemanticDiagnosticsBuilderProgram(parsed.fileNames, parsed.options, host, builder);
  const all = [
    ...parsed.errors,
    ...builder.getConfigFileParsingDiagnostics(),
    ...builder.getSyntacticDiagnostics(),
    ...builder.getGlobalDiagnostics(),
    ...builder.getSemanticDiagnostics(),
  ];
  return all
    .filter((d) => d.category === t.DiagnosticCategory.Error)
    .map((d) => ({
      file: d.file ? path.relative(projectRoot, d.file.fileName).split(path.sep).join("/") : "",
      line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
      code: d.code,
      message: t.flattenDiagnosticMessageText(d.messageText, " "),
    }));
}

parentPort?.on("message", (request: CheckRequest) => {
  let response: CheckResponse;
  if (!ts) response = { id: request.id, ok: false, error: unavailable ?? "TypeScript unavailable" };
  else {
    try {
      response = { id: request.id, ok: true, diagnostics: check(ts) };
    } catch (error) {
      response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  parentPort?.postMessage(response);
});

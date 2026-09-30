import { createPatch, structuredPatch } from "diff";

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface SourceDiff {
  /** Unified diff with no context lines. Empty string when nothing changed. */
  patch: string;
  hunks: DiffHunk[];
  linesAdded: number;
  linesRemoved: number;
}

export function diffSources(before: string, after: string, file = "source"): SourceDiff {
  if (before === after) return { patch: "", hunks: [], linesAdded: 0, linesRemoved: 0 };
  const { hunks } = structuredPatch(file, file, before, after, "", "", { context: 0 });
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) linesAdded++;
      else if (line.startsWith("-")) linesRemoved++;
    }
  }
  return {
    patch: createPatch(file, before, after, "", "", { context: 0 }),
    hunks: hunks.map(({ oldStart, oldLines, newStart, newLines, lines }) => ({ oldStart, oldLines, newStart, newLines, lines })),
    linesAdded,
    linesRemoved,
  };
}

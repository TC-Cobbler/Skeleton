import { useEffect, useState } from "react";
import type { Palette, PaletteEntry } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

/** The palette, checked against the project's component files; refreshed when files change. */
export function usePalette(projectRoot: string, revision: number): { palette: Palette | null; error: string | null } {
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("palette:list", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setPalette(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { palette, error };
}

export interface PalettePanelProps {
  palette: Palette | null;
  error: string | null;
}

/** Why an entry can't be placed, or null if it can. */
export function unavailableReason(item: PaletteEntry): string | null {
  if (item.available) return null;
  if (item.note) return item.note;
  return `This project doesn't have ${item.missing.join(", ")}.`;
}

/** The curated components and layout primitives (T3.1, PRD §9.1), by group. */
export function PalettePanel({ palette, error }: PalettePanelProps) {
  return (
    <section aria-label="Palette" className="palette">
      <h2>Palette</h2>
      {error && <p className="error">{error}</p>}
      {palette?.groups.map((group) => {
        const items = palette.items.filter((i) => i.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="palette-group">
            <h3>{group.label}</h3>
            <ul role="list" aria-label={`${group.label} components`}>
              {items.map((item) => {
                const why = unavailableReason(item);
                return (
                  <li
                    key={item.id}
                    data-testid={`palette-${item.id}`}
                    aria-disabled={why !== null}
                    className={`palette-item${why ? " is-disabled" : ""}`}
                    title={why ?? item.description}
                  >
                    {item.label}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

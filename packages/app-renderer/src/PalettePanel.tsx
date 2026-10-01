import { useEffect, useState } from "react";
import type { Palette, PaletteEntry } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { copy } from "./copy.js";
import { messageFor, type Message } from "./messages.js";
import { MessageText } from "./Toasts.js";

/** The palette, checked against the project's component files; refreshed when files change. */
export function usePalette(projectRoot: string, revision: number): { palette: Palette | null; error: Message | null } {
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState<Message | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("palette:list", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setPalette(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(messageFor(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { palette, error };
}

export interface PalettePanelProps {
  palette: Palette | null;
  error: Message | null;
  /** A press on a placeable entry: may become a drag onto the canvas (T3.2). */
  onStartDrag: (item: PaletteEntry, event: React.PointerEvent) => void;
}

/** Why an entry can't be placed, or null if it can. */
export function unavailableReason(item: PaletteEntry): string | null {
  if (item.available) return null;
  if (item.note) return item.note;
  return copy.palette.missing(item.missing);
}

/** The curated components and layout primitives (T3.1, PRD §9.1), by group. Drag one onto the canvas to place it. */
export function PalettePanel({ palette, error, onStartDrag }: PalettePanelProps) {
  return (
    <section aria-label={copy.palette.title} className="palette">
      <h2>{copy.palette.title}</h2>
      {error && <MessageText message={error} />}
      {palette?.groups.map((group) => {
        const items = palette.items.filter((i) => i.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="palette-group">
            <h3>{copy.palette.groupLabel(group.label)}</h3>
            <ul role="list" aria-label={copy.palette.groupList(group.label)}>
              {items.map((item) => {
                const why = unavailableReason(item);
                return (
                  <li
                    key={item.id}
                    data-testid={`palette-${item.id}`}
                    aria-disabled={why !== null}
                    className={`palette-item${why ? " is-disabled" : ""}`}
                    title={why ?? copy.palette.itemDescription(item.description)}
                    onPointerDown={why === null ? (e) => onStartDrag(item, e) : undefined}
                  >
                    {copy.palette.itemLabel(item.label)}
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

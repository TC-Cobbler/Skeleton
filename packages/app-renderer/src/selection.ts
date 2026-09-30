import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyedNode } from "./canvas/nodes.js";

type Selection = { key: string | null; id: string | null; name: string };

/**
 * The selection re-pointed at `nodes`: it follows the element's data-ui-id (or, for an
 * element without one, its key and name), and clears if the element is gone. A
 * selection by ID whose element isn't parsed yet stays pending (key null).
 */
function resolve(sel: Selection | null, nodes: KeyedNode[]): Selection | null {
  if (!sel) return sel;
  const match = sel.id ? nodes.find((n) => n.node.id === sel.id) : nodes.find((n) => n.key === sel.key && n.node.name === sel.name);
  // Still waiting for a placed element to be parsed.
  if (!match) return sel.key === null ? sel : null;
  return match.key === sel.key ? sel : { ...sel, key: match.key, name: match.node.name };
}

/**
 * Selection by tree key, re-pointed after every re-parse: keys are child-index paths
 * and shift when elements are added, so the selection follows the element's
 * data-ui-id (or clears if it's gone), never the old position. `selectId` selects an
 * element that may not be parsed yet (one just placed): it's picked up when it appears.
 *
 * The key is resolved against the current tree while rendering, not in an effect: an
 * effect runs after paint, so for one frame after every edit the old key showed the
 * element now at that position, or nothing (KI-1).
 */
export function useSelection(nodes: KeyedNode[]): [string | null, (key: string | null) => void, (id: string) => void] {
  const [selection, setSelection] = useState<Selection | null>(null);
  const select = useCallback(
    (key: string | null) => {
      const node = key === null ? null : nodes.find((n) => n.key === key);
      setSelection(node ? { key: node.key, id: node.node.id, name: node.node.name } : null);
    },
    [nodes],
  );
  const selectId = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.node.id === id);
      setSelection({ key: node?.key ?? null, id, name: node?.node.name ?? "" });
    },
    [nodes],
  );
  const current = useMemo(() => resolve(selection, nodes), [selection, nodes]);
  // Keep the resolved selection, so the next re-parse starts from where the element is now.
  useEffect(() => {
    if (current !== selection) setSelection(current);
  }, [current, selection]);
  return [current?.key ?? null, select, selectId];
}

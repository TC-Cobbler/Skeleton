import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementSchema, PageView } from "@skeleton/app-main/ipc";
import type { OverlayNode } from "@skeleton/overlay/protocol";
import { call } from "./bridge.js";
import { flatten, toOverlayNodes, type KeyedNode } from "./canvas/nodes.js";

export interface PageTreeState {
  tree: PageView | null;
  nodes: KeyedNode[];
  overlayNodes: OverlayNode[];
  error: string | null;
  /** Re-parse from disk (after an HMR update or an external change). */
  reload: () => void;
}

const NO_ELEMENTS: Record<string, ElementSchema> = {};

/**
 * A page's parsed tree from main (parsed trees are derived data: always re-read, never
 * stored). `elements` are the palette's schemas, which say which nodes take drops.
 */
export function usePageTree(projectRoot: string, file: string | null, elements: Record<string, ElementSchema> = NO_ELEMENTS): PageTreeState {
  const [tree, setTree] = useState<PageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!file) {
      setTree(null);
      return;
    }
    let cancelled = false;
    call("page:tree", { projectRoot, file }).then(
      (next) => {
        if (cancelled) return;
        setTree(next);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, file, revision]);

  const nodes = useMemo(() => (tree ? flatten(tree) : []), [tree]);
  const overlayNodes = useMemo(() => toOverlayNodes(nodes, elements), [nodes, elements]);
  const reload = useCallback(() => setRevision((r) => r + 1), []);
  return { tree, nodes, overlayNodes, error, reload };
}

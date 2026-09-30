import { useCallback, useEffect, useMemo, useState } from "react";
import type { PageTree } from "@skeleton/app-main/ipc";
import type { OverlayNode } from "@skeleton/overlay/protocol";
import { call } from "./bridge.js";
import { flatten, toOverlayNodes, type KeyedNode } from "./canvas/nodes.js";

export interface PageTreeState {
  tree: PageTree | null;
  nodes: KeyedNode[];
  overlayNodes: OverlayNode[];
  error: string | null;
  /** Re-parse from disk (after an HMR update or an external change). */
  reload: () => void;
}

/** A page's parsed tree from main (parsed trees are derived data: always re-read, never stored). */
export function usePageTree(projectRoot: string, file: string | null): PageTreeState {
  const [tree, setTree] = useState<PageTree | null>(null);
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
  const overlayNodes = useMemo(() => toOverlayNodes(nodes), [nodes]);
  const reload = useCallback(() => setRevision((r) => r + 1), []);
  return { tree, nodes, overlayNodes, error, reload };
}

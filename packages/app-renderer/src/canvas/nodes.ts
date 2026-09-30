import type { PageTree, UiNode } from "@skeleton/app-main/ipc";
import type { OverlayNode } from "@skeleton/overlay/protocol";

export interface KeyedNode {
  key: string;
  node: UiNode;
  depth: number;
}

/** Depth-first list of a page's nodes, keyed by child-index path ("0", "0.2", "0.2.1"). */
export function flatten(tree: PageTree): KeyedNode[] {
  const out: KeyedNode[] = [];
  const walk = (node: UiNode, key: string, depth: number) => {
    out.push({ key, node, depth });
    node.children.forEach((child, i) => walk(child, `${key}.${i}`, depth + 1));
  };
  tree.roots.forEach((root, i) => walk(root, String(i), 0));
  return out;
}

export function toOverlayNodes(nodes: KeyedNode[]): OverlayNode[] {
  return nodes.map(({ key, node }) => ({
    key,
    kind: node.kind,
    name: node.name,
    id: node.id,
    lockReason: node.lockReason,
    element: node.element,
    start: node.range.start,
    end: node.range.end,
  }));
}

import type { ElementSchema, PageTree, UiNode } from "@skeleton/app-main/ipc";
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

/** Plain HTML elements that hold other elements (agent-written layout), as drop targets. */
const PLAIN_CONTAINERS = new Set(["div", "section", "main", "header", "footer", "aside", "nav", "article", "form", "fieldset", "ul", "ol", "li"]);

/**
 * Can elements be dropped into this node? It has to be editable, have an ID (`insert`
 * addresses it by ID), hold no text, and be a container: a palette part or primitive
 * whose schema takes any elements, or a plain layout element.
 */
export function acceptsDrop(node: UiNode, elements: Record<string, ElementSchema>): boolean {
  if (node.kind === "locked" || !node.element || node.id === null || node.text !== null) return false;
  if (node.kind === "plain") return PLAIN_CONTAINERS.has(node.name);
  return elements[node.name]?.children === "nodes";
}

export function toOverlayNodes(nodes: KeyedNode[], elements: Record<string, ElementSchema>): OverlayNode[] {
  return nodes.map(({ key, node }) => ({
    key,
    kind: node.kind,
    name: node.name,
    id: node.id,
    lockReason: node.lockReason,
    element: node.element,
    start: node.range.start,
    end: node.range.end,
    drop: acceptsDrop(node, elements),
  }));
}

import type { ElementSchema, PageTree, UiNode } from "@skeleton/app-main/ipc";
import type { OverlayNode } from "@skeleton/overlay/protocol";
import { copy } from "../copy.js";

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

/** "0.2.1" → "0.2"; a root's parent is null. */
export function parentKeyOf(key: string): string | null {
  const dot = key.lastIndexOf(".");
  return dot < 0 ? null : key.slice(0, dot);
}

/**
 * Can this node be dragged elsewhere (T3.3)? Locked blocks can, as a unit. Its parent
 * must be an editable element (children of a locked block are edited in place only,
 * ADR 002), and `move` must be able to address it: by its own ID, or by position
 * under its parent's ID.
 */
export function canMove(node: UiNode, parent: UiNode | null): boolean {
  if (!parent || parent.kind === "locked" || !parent.element) return false;
  return node.id !== null || parent.id !== null;
}

export function toOverlayNodes(nodes: KeyedNode[], elements: Record<string, ElementSchema>): OverlayNode[] {
  const byKey = new Map(nodes.map((n) => [n.key, n.node]));
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
    move: canMove(node, byKey.get(parentKeyOf(key) ?? "") ?? null),
  }));
}

/**
 * The agent code that deleting `node` would delete with it (T3.4): locked blocks and
 * protected (logic-bearing) props in its subtree, as short descriptions. Empty means
 * the subtree is Skeleton-placed layout only.
 */
export function agentLogicIn(node: UiNode): string[] {
  const out: string[] = [];
  const label = (n: UiNode) => `${n.name}${n.id ? ` #${n.id}` : ""}`;
  const walk = (n: UiNode) => {
    if (n.kind === "locked") {
      out.push(copy.nodes.lockedLogic(n.element ? label(n) : n.name, n.lockReason ?? copy.layers.locked));
    } else if (n.protectedProps.length > 0) {
      out.push(copy.nodes.protectedLogic(n.protectedProps, label(n)));
    }
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export type NodeRef = { id: string } | { parentId: string; index: number };

/**
 * How `remove` (or `move`) addresses the node at `key`, or why it can't touch it:
 * never a root, never an element wrapped by a locked block (ADR 002), and it needs
 * an ID of its own or on its parent.
 */
export function refFor(nodes: KeyedNode[], key: string): { ref: NodeRef } | { reason: string } {
  const node = nodes.find((n) => n.key === key)?.node;
  const parentKey = parentKeyOf(key);
  const parent = parentKey === null ? null : (nodes.find((n) => n.key === parentKey)?.node ?? null);
  if (!node) return { reason: copy.nodes.gone };
  if (!parent) return { reason: copy.nodes.rootRemove };
  if (parent.kind === "locked" || !parent.element) {
    return { reason: copy.nodes.insideLockedRemove(parent.name) };
  }
  if (node.id) return { ref: { id: node.id } };
  if (parent.id) return { ref: { parentId: parent.id, index: Number(key.slice(key.lastIndexOf(".") + 1)) } };
  return { reason: copy.nodes.noIds };
}

/**
 * Where Move up / Move down takes the node at `key` (F-2): one place earlier or later
 * among its siblings, or why it can't go. The index counts the siblings with the node
 * taken out, as `move` does: "down" goes to index + 1, after the next sibling.
 */
export function reorderTarget(nodes: KeyedNode[], key: string, direction: "up" | "down"): { parentKey: string; index: number } | { reason: string } {
  const node = nodes.find((n) => n.key === key)?.node;
  const parentKey = parentKeyOf(key);
  const parent = parentKey === null ? null : (nodes.find((n) => n.key === parentKey)?.node ?? null);
  if (!node || parentKey === null || !parent) return { reason: copy.nodes.rootMove };
  if (!canMove(node, parent)) return { reason: copy.nodes.insideLockedMove(parent.name) };
  if (!parent.id) return { reason: copy.nodes.noId(parent.name) };
  const from = Number(key.slice(key.lastIndexOf(".") + 1));
  if (direction === "up") return from > 0 ? { parentKey, index: from - 1 } : { reason: copy.nodes.first };
  return from < parent.children.length - 1 ? { parentKey, index: from + 1 } : { reason: copy.nodes.last };
}

/** Palette overlays whose content isn't on the canvas while they're closed (F-6). */
const OPENABLE = new Set(["Dialog", "Sheet"]);

/**
 * The Dialog or Sheet the node at `key` is, or is inside: the one "Open in canvas"
 * opens (F-6). Null when there's none.
 */
export function openableFor(nodes: KeyedNode[], key: string | null): string | null {
  for (let k = key; k !== null; k = parentKeyOf(k)) {
    const node = nodes.find((n) => n.key === k)?.node;
    if (node?.element && OPENABLE.has(node.name)) return k;
  }
  return null;
}

/** Plain elements that can't hold text. */
const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * Can `setText` edit this element's text (T3.5, and on the canvas, F-5)? It needs an ID,
 * no child elements or expressions, and to be something that holds text: a palette
 * element whose schema takes text, or a plain non-void element.
 */
export function textEditable(node: UiNode, schema: ElementSchema | null): boolean {
  if (node.kind === "locked" || !node.element || node.id === null) return false;
  return node.children.length === 0 && (schema ? schema.children === "text" : !VOID.has(node.name));
}

// DOM → source mapping (ADR 006). The dev plugin tags page-file JSX with
// data-skeleton-loc="<file>:<offset>". Host elements carry it as an attribute;
// components receive it as a prop, which React keeps on their fiber. Walking the
// fiber `.return` chain from any DOM node therefore yields every page-level JSX
// element it was rendered through. React internals live only in this module.

import { LOC_ATTR, type OverlayNode } from "./protocol.js";

interface Fiber {
  return: Fiber | null;
  memoizedProps: unknown;
}

function fiberOf(el: Element): Fiber | null {
  for (const key of Object.keys(el)) {
    if (key.startsWith("__reactFiber$")) return (el as unknown as Record<string, Fiber>)[key] ?? null;
  }
  return null;
}

/**
 * Offsets (in `file`) of the page-level JSX elements `el` was rendered through,
 * innermost first. Falls back to DOM attributes for nodes React doesn't own.
 */
export function locChain(el: Element, file: string): number[] {
  const prefix = `${file}:`;
  const out: number[] = [];
  const add = (loc: unknown) => {
    if (typeof loc !== "string" || !loc.startsWith(prefix)) return;
    const offset = Number(loc.slice(prefix.length));
    if (Number.isInteger(offset) && !out.includes(offset)) out.push(offset);
  };
  let start: Element | null = el;
  let fiber: Fiber | null = null;
  while (start && !(fiber = fiberOf(start))) {
    add(start.getAttribute(LOC_ATTR));
    start = start.parentElement;
  }
  for (let f = fiber; f; f = f.return) {
    const props = f.memoizedProps;
    if (typeof props === "object" && props !== null) add((props as Record<string, unknown>)[LOC_ATTR]);
  }
  return out;
}

/** Which nodes `offset` (from a loc chain) can stand for: exact element starts. */
export class NodeIndex {
  private readonly byStart = new Map<number, OverlayNode>();
  private chains = new WeakMap<Element, number[]>();

  constructor(
    readonly file: string,
    readonly nodes: OverlayNode[],
  ) {
    for (const n of nodes) if (n.element) this.byStart.set(n.start, n);
  }

  /** Forget cached chains (call after DOM changes). */
  invalidate(): void {
    this.chains = new WeakMap();
  }

  chain(el: Element): number[] {
    let c = this.chains.get(el);
    if (!c) {
      c = locChain(el, this.file);
      this.chains.set(el, c);
    }
    return c;
  }

  /** The innermost source element `el` belongs to, or null if none on this page. */
  hit(el: Element): OverlayNode | null {
    for (const offset of this.chain(el)) {
      const node = this.byStart.get(offset);
      if (node) return node;
    }
    return null;
  }

  /** Top-most DOM elements rendered by `node`, in document order. */
  elementsOf(node: OverlayNode, root: ParentNode, skip?: Element): Element[] {
    const belongs = (el: Element) => {
      const chain = this.chain(el);
      return node.element
        ? chain.includes(node.start)
        : chain.some((offset) => offset >= node.start && offset < node.end);
    };
    const out: Element[] = [];
    const walk = (parent: ParentNode) => {
      for (const child of Array.from(parent.children)) {
        if (child === skip) continue;
        if (belongs(child)) out.push(child);
        else walk(child);
      }
    };
    walk(root);
    return out;
  }
}

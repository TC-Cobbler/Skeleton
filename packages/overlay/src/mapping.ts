// DOM → source mapping (ADR 006). The dev plugin tags page-file JSX with
// data-skeleton-loc="<file>:<offset>@<version>". Host elements carry it as an attribute;
// components receive it as a prop, which React keeps on their fiber. Walking the
// fiber `.return` chain from any DOM node therefore yields every page-level JSX
// element it was rendered through. React internals live only in this module.

import { LOC_ATTR, type OverlayNode } from "./protocol.js";

interface Fiber {
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  memoizedProps: unknown;
}

function internal<T>(el: Element, prefix: string): T | null {
  for (const key of Object.keys(el)) {
    if (key.startsWith(prefix)) return (el as unknown as Record<string, T>)[key] ?? null;
  }
  return null;
}

/**
 * The committed fiber for a DOM element. React swaps each fiber with its alternate on
 * every render, and a DOM node keeps pointing at whichever it was created with, so
 * that pointer can be the stale copy holding old props (old offsets after HMR). React
 * does keep the node's current props up to date: the current fiber is the one whose
 * props they are.
 */
function fiberOf(el: Element): Fiber | null {
  const fiber = internal<Fiber>(el, "__reactFiber$");
  if (!fiber) return null;
  const props = internal<unknown>(el, "__reactProps$");
  if (props !== null && fiber.alternate && fiber.alternate.memoizedProps === props) return fiber.alternate;
  return fiber;
}

/**
 * The committed parent of a committed fiber. `return` can point at the parent's stale
 * alternate; the committed parent is the one whose child list holds this fiber
 * (React commits the tree top-down through `child`/`sibling`).
 */
function parentOf(fiber: Fiber): Fiber | null {
  const parent = fiber.return;
  if (!parent) return null;
  const holds = (p: Fiber) => {
    for (let c = p.child; c; c = c.sibling) if (c === fiber) return true;
    return false;
  };
  if (!holds(parent) && parent.alternate && holds(parent.alternate)) return parent.alternate;
  return parent;
}

/**
 * Offsets (in `file`, at `version`) of the page-level JSX elements `el` was rendered
 * through, innermost first. Locs from another version of the file are skipped: the
 * DOM and the tree disagree until both have caught up with an edit. Falls back to
 * DOM attributes for nodes React doesn't own.
 */
export function locChain(el: Element, file: string, version: string): number[] {
  const prefix = `${file}:`;
  const suffix = `@${version}`;
  const out: number[] = [];
  const add = (loc: unknown) => {
    if (typeof loc !== "string" || !loc.startsWith(prefix) || !loc.endsWith(suffix)) return;
    const offset = Number(loc.slice(prefix.length, loc.length - suffix.length));
    if (Number.isInteger(offset) && !out.includes(offset)) out.push(offset);
  };
  let start: Element | null = el;
  let fiber: Fiber | null = null;
  while (start && !(fiber = fiberOf(start))) {
    add(start.getAttribute(LOC_ATTR));
    start = start.parentElement;
  }
  for (let f = fiber; f; f = parentOf(f)) {
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
    readonly version: string,
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
      c = locChain(el, this.file, this.version);
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

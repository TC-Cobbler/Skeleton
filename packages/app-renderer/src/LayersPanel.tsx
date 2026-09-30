import { useEffect, useRef, useState } from "react";
import type { KeyedNode } from "./canvas/nodes.js";

export interface LayersPanelProps {
  nodes: KeyedNode[];
  selected: string | null;
  hovered: string | null;
  /** Keys with DOM on the canvas right now; null until the overlay reports. */
  onScreen: Set<string> | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
}

/** The page's element tree, from the parser (T2.3). Selection syncs with the canvas both ways. */
export function LayersPanel({ nodes, selected, hovered, onScreen, onSelect, onHover }: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const list = useRef<HTMLUListElement>(null);

  // A selection made on the canvas reveals its row: expand ancestors, scroll into view.
  useEffect(() => {
    if (!selected) return;
    setCollapsed((prev) => {
      const next = new Set([...prev].filter((k) => !selected.startsWith(`${k}.`)));
      return next.size === prev.size ? prev : next;
    });
    list.current?.querySelector(`[data-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const hidden = (key: string) => [...collapsed].some((k) => key.startsWith(`${k}.`));
  const hasChildren = (i: number) => (nodes[i + 1]?.depth ?? -1) > (nodes[i]?.depth ?? 0);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <section aria-label="Layers" className="layers">
      <h2>Layers</h2>
      <ul ref={list} role="tree" aria-label="Layers tree" onMouseLeave={() => onHover(null)}>
        {nodes.map(({ key, node, depth }, i) =>
          hidden(key) ? null : (
            <li
              key={key}
              role="treeitem"
              aria-selected={key === selected}
              aria-expanded={hasChildren(i) ? !collapsed.has(key) : undefined}
              data-key={key}
              data-testid={node.id ? `layer-${node.id}` : undefined}
              className={[
                "layer",
                `layer-${node.kind}`,
                key === selected ? "is-selected" : "",
                key === hovered ? "is-hovered" : "",
                onScreen && !onScreen.has(key) ? "is-offscreen" : "",
              ].join(" ")}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onSelect(key)}
              onMouseEnter={() => onHover(key)}
              title={onScreen && !onScreen.has(key) ? "Not rendered on the canvas right now" : undefined}
            >
              {hasChildren(i) ? (
                <button
                  type="button"
                  className="twisty"
                  aria-label={collapsed.has(key) ? "Expand" : "Collapse"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(key);
                  }}
                >
                  {collapsed.has(key) ? "▸" : "▾"}
                </button>
              ) : (
                <span className="twisty" />
              )}
              {node.kind === "locked" && <span aria-label="locked">🔒</span>}
              <span className="layer-name">{node.name}</span>
              {node.id && <code className="layer-id">{node.id}</code>}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

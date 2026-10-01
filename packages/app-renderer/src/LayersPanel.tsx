import { useEffect, useRef, useState } from "react";
import type { KeyedNode } from "./canvas/nodes.js";
import { copy } from "./copy.js";
import { elementName } from "./names.js";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Hinted, IconButton } from "./Tooltip.js";

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
    // Scroll only the sidebar. scrollIntoView would scroll every ancestor, window
    // included, and move the canvas under the user's pointer.
    const row = list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selected)}"]`);
    const scroller = row?.closest<HTMLElement>(".sidebar");
    if (row && scroller) {
      const r = row.getBoundingClientRect();
      const c = scroller.getBoundingClientRect();
      if (r.top < c.top) scroller.scrollTop -= c.top - r.top;
      else if (r.bottom > c.bottom) scroller.scrollTop += r.bottom - c.bottom;
    }
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
    <section aria-label={copy.layers.title} className="layers">
      <h2>{copy.layers.title}</h2>
      <ul ref={list} role="tree" aria-label={copy.layers.tree} onMouseLeave={() => onHover(null)}>
        {nodes.map(({ key, node, depth }, i) =>
          hidden(key) ? null : (
            <Hinted key={key} text={onScreen && !onScreen.has(key) ? copy.layers.offscreen : null}>
              <li
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
              >
                {hasChildren(i) ? (
                  <IconButton
                    className="twisty"
                    size={16}
                    icon={collapsed.has(key) ? ChevronRight : ChevronDown}
                    label={collapsed.has(key) ? copy.layers.expand : copy.layers.collapse}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(key);
                    }}
                  />
                ) : (
                  <span className="twisty" />
                )}
                {node.kind === "locked" && <span aria-label={copy.layers.locked}>🔒</span>}
                <span className="layer-name">{elementName(node)}</span>
              </li>
            </Hinted>
          ),
        )}
      </ul>
    </section>
  );
}

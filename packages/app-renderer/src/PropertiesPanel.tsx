import { useEffect, useState } from "react";
import type { ClassGroup, EditIntent, ElementSchema, PropSchema, UiNode } from "@skeleton/app-main/ipc";
import { textEditable } from "./canvas/nodes.js";
import { copy } from "./copy.js";
import { elementKind, layoutLabel, layoutOptionLabel, optionLabel, settingLabel, settingShown } from "./names.js";
import { Hinted } from "./Tooltip.js";

type PropValue = string | number | boolean | null;

export interface PropertiesPanelProps {
  node: UiNode;
  /** The element's palette schema, if it has one. */
  schema: ElementSchema | null;
  layout: { stack: ClassGroup[]; grid: ClassGroup[] } | null;
  onEdit: (edit: EditIntent) => void;
}

/**
 * Properties of the selected element (T3.5): its schema props, text content and, for
 * Stacks and Grids, layout properties as classes. Every change is one edit op.
 */
export function PropertiesPanel({ node, schema, layout, onEdit }: PropertiesPanelProps) {
  if (node.kind === "locked") return null;
  const id = node.id;
  if (!id) {
    return (
      <section aria-label={copy.properties.title} className="properties">
        <h2>{copy.properties.title}</h2>
        <p className="muted">{copy.properties.noId}</p>
      </section>
    );
  }
  const hasText = textEditable(node, schema);
  const groups = schema?.layout === "stack" ? layout?.stack : schema?.layout === "grid" ? layout?.grid : undefined;
  const classNameProtected = node.protectedProps.includes("className");
  const classes = typeof node.props["className"] === "string" ? node.props["className"].split(/\s+/).filter(Boolean) : [];

  return (
    <section aria-label={copy.properties.title} className="properties" data-testid="properties">
      <h2>{copy.properties.title}</h2>
      {schema && schema.props.length > 0 && (
        <div className="prop-grid">
          {schema.props.filter((prop) => settingShown(prop.name)).map((prop) =>
            node.protectedProps.includes(prop.name) ? (
              <Row key={prop.name} label={settingLabel(prop.name, node.name)}>
                <Hinted text={copy.properties.agentSetTitle}>
                  <span className="muted">
                    {copy.properties.agentSet}
                  </span>
                </Hinted>
              </Row>
            ) : (
              <Row key={prop.name} label={settingLabel(prop.name, node.name)}>
                <PropControl prop={prop} element={node.name} value={node.props[prop.name]} onChange={(value) => onEdit({ op: "setProp", id, key: prop.name, value })} />
              </Row>
            ),
          )}
        </div>
      )}
      {hasText && (
        <div className="prop-grid">
          <Row label={copy.properties.text}>
            <TextInput label={copy.properties.text} value={node.text ?? ""} onCommit={(text) => onEdit({ op: "setText", id, text })} />
          </Row>
        </div>
      )}
      {groups && (
        <>
          <h3>{schema?.layout === "grid" ? copy.properties.grid : elementKind(node)}</h3>
          {classNameProtected ? (
            <p className="muted">{copy.properties.agentLayout}</p>
          ) : (
            <div className="prop-grid">
              {groups.map((group) => (
                <Row key={group.id} label={layoutLabel(group.label)}>
                  <ClassControl group={group} classes={classes} onChange={(add, remove) => onEdit({ op: "setClass", id, add, remove })} />
                </Row>
              ))}
            </div>
          )}
        </>
      )}
      {!schema && !textEditable && !groups && <p className="muted">{copy.properties.empty}</p>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children}</span>
    </>
  );
}

/** Choosing the prop's default removes the attribute, keeping the code minimal. */
function PropControl({ prop, element, value, onChange }: { prop: PropSchema; element: string; value: PropValue | undefined; onChange: (value: PropValue) => void }) {
  const label = settingLabel(prop.name, element);
  const set = (next: PropValue) => onChange(next === prop.default ? null : next);
  switch (prop.type) {
    case "enum": {
      const current = typeof value === "string" ? value : prop.default;
      return (
        <select aria-label={label} value={current} onChange={(e) => set(e.target.value)}>
          {!prop.options.includes(current) && <option value={current}>{copy.properties.custom(current)}</option>}
          {prop.options.map((o) => (
            <option key={o} value={o}>
              {optionLabel(prop.name, o, element)}
            </option>
          ))}
        </select>
      );
    }
    case "boolean":
      return <input type="checkbox" aria-label={label} checked={typeof value === "boolean" ? value : prop.default} onChange={(e) => set(e.target.checked)} />;
    case "string":
      return (
        <TextInput
          label={label}
          value={typeof value === "string" ? value : (prop.default ?? "")}
          // Clearing an optional prop removes it; a required one (non-null default) is never removed.
          onCommit={(text) => onChange(text === "" && prop.default === null ? null : text)}
        />
      );
    case "number":
      return (
        <TextInput
          label={label}
          type="number"
          value={typeof value === "number" ? String(value) : prop.default === null ? "" : String(prop.default)}
          onCommit={(text) => {
            if (text.trim() === "") return onChange(null);
            const n = Number(text);
            if (!Number.isFinite(n)) return;
            const clamped = Math.min(prop.max ?? Infinity, Math.max(prop.min ?? -Infinity, n));
            set(clamped);
          }}
        />
      );
  }
}

/** A text field that edits on blur or Enter (Escape reverts), not on every keystroke. */
export function TextInput({ label, value, type = "text", onCommit }: { label: string; value: string; type?: "text" | "number"; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      aria-label={label}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** One layout property: swaps the group's current base class for the chosen one. */
function ClassControl({ group, classes, onChange }: { group: ClassGroup; classes: string[]; onChange: (add: string[], remove: string[]) => void }) {
  const re = new RegExp(group.pattern);
  const current = classes.filter((c) => re.test(c));
  const selected = current[0] ?? "";
  const listed = group.options.some((o) => (o.class ?? "") === selected);
  return (
    <select
      aria-label={layoutLabel(group.label)}
      value={selected}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [], current)}
    >
      {!listed && <option value={selected}>{copy.properties.custom(selected)}</option>}
      {group.options.map((o) => (
        <option key={o.class ?? ""} value={o.class ?? ""}>
          {layoutOptionLabel(o.label)}
        </option>
      ))}
    </select>
  );
}

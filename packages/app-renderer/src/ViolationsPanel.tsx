import { useEffect, useState } from "react";
import type { ViolationItem, ViolationReport } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { copy } from "./copy.js";
import { messageFor, type Message } from "./messages.js";
import { MessageText } from "./Toasts.js";
import { Tooltip } from "./Tooltip.js";

/** The project's violations, re-read when files change. */
export function useViolations(projectRoot: string, revision: number): { report: ViolationReport | null; error: Message | null } {
  const [report, setReport] = useState<ViolationReport | null>(null);
  const [error, setError] = useState<Message | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("violations:list", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setReport(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(messageFor(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { report, error };
}

const PROPERTY: Record<ViolationItem["property"], string> = copy.violations.property;

const PROMOTE_PREFIX: Record<NonNullable<ViolationItem["promote"]>, string> = { radius: "--radius-", spacing: "--spacing-", text: "--text-", colour: "--" };

export interface ViolationsPanelProps {
  report: ViolationReport | null;
  error: Message | null;
  onSelect: (item: ViolationItem) => void;
  onSnap: (item: ViolationItem) => void;
  onPromote: (item: ViolationItem, name: string) => void;
  onKeep: (item: ViolationItem) => void;
}

/**
 * Every instance override in the project (T4.6, PRD §10.4): element, property, value
 * and the nearest token, with Snap to token, Promote to token, and Keep. Overrides in
 * agent code can only be kept (or fixed in code).
 */
export function ViolationsPanel({ report, error, onSelect, onSnap, onPromote, onKeep }: ViolationsPanelProps) {
  const [showKept, setShowKept] = useState(false);
  const items = report?.items ?? [];
  const kept = items.filter((v) => v.kept).length;
  const shown = items.filter((v) => showKept || !v.kept);
  return (
    <section aria-label={copy.violations.title} className="violations" data-testid="violations">
      <h2>{copy.violations.title}</h2>
      {error && <MessageText message={error} />}
      {report?.errors.map((e) => (
        <p key={e} className="error small">
          {e}
        </p>
      ))}
      {report && items.length - kept === 0 && <p className="muted">{copy.violations.empty}</p>}
      {kept > 0 && (
        <label className="row small muted">
          <input type="checkbox" checked={showKept} onChange={(e) => setShowKept(e.target.checked)} /> {copy.violations.showKept(kept)}
        </label>
      )}
      <ul role="list">
        {shown.map((v) => (
          <ViolationRow key={`${v.file}:${v.offset}:${v.value}`} item={v} onSelect={onSelect} onSnap={onSnap} onPromote={onPromote} onKeep={onKeep} />
        ))}
      </ul>
    </section>
  );
}

function ViolationRow({ item, onSelect, onSnap, onPromote, onKeep }: { item: ViolationItem } & Omit<ViolationsPanelProps, "report" | "error">) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const valid = /^[a-z][a-z0-9-]{0,30}$/.test(name);
  const value = item.kind === "inline-style" ? item.value.replace(/\s+/g, " ") : item.value;
  return (
    <li className={`violation${item.kept ? " is-kept" : ""}`} data-testid="violation">
      <div className="violation-head">
        <Tooltip text={`${item.file}:${item.line}`}>
          <button type="button" className="link" onClick={() => onSelect(item)}>
            {item.element ? copy.violations.element(item.element.name, item.element.id) : `${item.file}:${item.line}`}
          </button>
        </Tooltip>
        <span className="muted small">{PROPERTY[item.property]}</span>
      </div>
      <code className="violation-value">{value}</code>
      {item.nearest && (
        <div className="muted small">
          {copy.violations.nearest} <code>{item.nearest.utility}</code> {copy.violations.nearestValue(item.nearest.token, item.nearest.value)}
        </div>
      )}
      {!item.editable && !item.kept && <div className="muted small">{copy.violations.inAgentCode}</div>}
      {!item.kept && (
        <div className="row violation-actions">
          {item.editable && item.nearest && (
            <Tooltip text={copy.violations.snapTitle(item.nearest.utility)}>
              <button type="button" onClick={() => onSnap(item)}>
                {copy.violations.snap}
              </button>
            </Tooltip>
          )}
          {item.editable && item.promote && (
            <button type="button" aria-expanded={naming} onClick={() => setNaming((n) => !n)}>
              {copy.violations.promote}
            </button>
          )}
          <Tooltip text={copy.violations.keepTitle}>
            <button type="button" onClick={() => onKeep(item)}>
              {copy.violations.keep}
            </button>
          </Tooltip>
        </div>
      )}
      {naming && item.promote && (
        <form
          className="row"
          aria-label={copy.violations.promoteForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onPromote(item, name);
            setNaming(false);
          }}
        >
          <span className="muted small">{PROMOTE_PREFIX[item.promote]}</span>
          <input aria-label={copy.violations.tokenName} placeholder={copy.violations.namePlaceholder} value={name} onChange={(e) => setName(e.target.value.trim())} />
          <button type="submit" disabled={!valid}>
            {copy.violations.create}
          </button>
        </form>
      )}
    </li>
  );
}

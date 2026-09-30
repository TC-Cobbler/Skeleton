import { useEffect, useState } from "react";
import type { ThemeToken, TokenGroup, TokenSheet, TokenWrite } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { TextInput } from "./PropertiesPanel.js";

/** The project's tokens, re-read when files change. */
export function useTokens(projectRoot: string, revision: number): { sheet: TokenSheet | null; error: string | null; set: (sheet: TokenSheet) => void } {
  const [sheet, setSheet] = useState<TokenSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("tokens:read", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setSheet(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { sheet, error, set: setSheet };
}

const GROUPS: { id: TokenGroup; label: string }[] = [
  { id: "colour", label: "Colour" },
  { id: "radius", label: "Radius" },
  { id: "spacing", label: "Spacing" },
  { id: "type", label: "Type" },
  { id: "font", label: "Font" },
  { id: "border", label: "Border width" },
];

export interface TokensPanelProps {
  sheet: TokenSheet | null;
  error: string | null;
  /** The mode the canvas shows: its column is marked (colour edits target it, T4.7). */
  dark: boolean;
  /** Elements on the page each token affects (T4.2), when known. */
  counts: Record<string, number> | null;
  onWrite: (writes: TokenWrite[]) => void;
  /** A token row is hovered: highlight what it affects on the canvas (T4.2). */
  onHover: (name: string | null) => void;
}

/**
 * Every token (T4.1, PRD §10.1), light and dark values side by side, with exact
 * inputs. A derived token shows its formula and what it comes to, and can be
 * detached to that literal, or re-attached to the template's formula.
 */
export function TokensPanel({ sheet, error, dark, counts, onWrite, onHover }: TokensPanelProps) {
  const [filter, setFilter] = useState("");
  return (
    <section aria-label="Tokens" className="tokens" data-testid="tokens">
      <h2>Tokens</h2>
      {error && <p className="error">{error}</p>}
      {sheet && (
        <>
          <input aria-label="Filter tokens" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <p className="muted small">{sheet.file}</p>
          {GROUPS.map((group) => {
            const tokens = sheet.tokens.filter((t) => t.group === group.id && t.name.includes(filter.trim()));
            if (tokens.length === 0) return null;
            return (
              <div key={group.id} className="token-group">
                <h3>{group.label}</h3>
                {group.id === "colour" && (
                  <div className="token-modes muted">
                    <span className={dark ? "" : "is-shown"}>Light</span>
                    <span className={dark ? "is-shown" : ""}>Dark</span>
                  </div>
                )}
                <ul role="list">
                  {tokens.map((token) => (
                    <TokenRow key={token.name} token={token} count={counts?.[token.name] ?? null} onWrite={onWrite} onHover={onHover} />
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function TokenRow({
  token,
  count,
  onWrite,
  onHover,
}: {
  token: ThemeToken;
  count: number | null;
  onWrite: (writes: TokenWrite[]) => void;
  onHover: (name: string | null) => void;
}) {
  const derived = token.references.length > 0;
  const detached = !derived && token.defaultFormula !== null;
  const write = (value: string, mode: TokenWrite["mode"]) => value.trim() !== "" && onWrite([{ name: token.name, value, mode }]);
  return (
    <li className="token" data-testid={`token-${token.name}`} onPointerEnter={() => onHover(token.name)} onPointerLeave={() => onHover(null)}>
      <div className="token-head">
        <code>{token.name}</code>
        {count !== null && (
          <span className="muted small" title="Elements on this page it affects" data-testid="token-count">
            {count}
          </span>
        )}
      </div>
      <div className={`token-values${token.dark !== null ? " has-dark" : ""}`}>
        <TokenValue label={`${token.name} value`} value={token.value} swatch={token.group === "colour"} onCommit={(v) => write(v, token.dark !== null ? "light" : null)} />
        {token.dark !== null && <TokenValue label={`${token.name} dark value`} value={token.dark} swatch onCommit={(v) => write(v, "dark")} />}
      </div>
      {(derived || detached) && (
        <div className="token-derived muted small">
          {derived ? (
            <>
              <span title="Derived: follows the tokens it refers to">= {token.resolved ?? "…"}</span>
              <button
                type="button"
                className="quiet"
                disabled={token.resolved === null}
                title={token.resolved === null ? "It doesn't come to a single value, so it can't be detached here" : `Replace the formula with ${token.resolved}`}
                onClick={() => token.resolved !== null && write(token.resolved, null)}
              >
                Detach
              </button>
            </>
          ) : (
            <>
              <span>Detached</span>
              <button type="button" className="quiet" title={`Back to ${token.defaultFormula}`} onClick={() => token.defaultFormula && write(token.defaultFormula, null)}>
                Attach
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TokenValue({ label, value, swatch, onCommit }: { label: string; value: string; swatch: boolean; onCommit: (value: string) => void }) {
  return (
    <span className="token-value">
      {swatch && <span className="swatch" style={{ background: value }} aria-hidden="true" />}
      <TextInput label={label} value={value} onCommit={onCommit} />
    </span>
  );
}

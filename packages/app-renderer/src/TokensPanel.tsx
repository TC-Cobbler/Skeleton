import { useEffect, useState } from "react";
import type { ThemeToken, TokenGroup, TokenSheet, TokenWrite } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { TextInput } from "./PropertiesPanel.js";
import { alphaFor, hexToOklch } from "./colour.js";
import { ColourSwatch } from "./ColourPicker.js";
import { copy } from "./copy.js";
import { themeName } from "./names.js";
import { messageFor, type Message } from "./messages.js";
import { MessageText } from "./Toasts.js";
import { Hinted, Tooltip } from "./Tooltip.js";

/** The project's tokens, re-read when files change. */
export function useTokens(projectRoot: string, revision: number): { sheet: TokenSheet | null; error: Message | null; set: (sheet: TokenSheet) => void } {
  const [sheet, setSheet] = useState<TokenSheet | null>(null);
  const [error, setError] = useState<Message | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("tokens:read", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setSheet(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(messageFor(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { sheet, error, set: setSheet };
}

const GROUPS: { id: TokenGroup; label: string }[] = (["colour", "radius", "spacing", "type", "font", "border"] as const).map((id) => ({ id, label: copy.tokens.groups[id] }));

export interface TokensPanelProps {
  sheet: TokenSheet | null;
  error: Message | null;
  /** The mode the canvas shows: its column is marked (colour edits target it, T4.7). */
  dark: boolean;
  /** Elements on the page each token affects (T4.2), when known. */
  counts: Record<string, number> | null;
  onWrite: (writes: TokenWrite[]) => void;
  /** A token row is hovered: highlight what it affects on the canvas (T4.2). */
  onHover: (name: string | null) => void;
  /** A colour being picked, as CSS to preview on the canvas; null to stop. */
  onPreview?: (css: string | null) => void;
}

/**
 * Every token (T4.1, PRD §10.1), light and dark values side by side, with exact
 * inputs. A derived token shows its formula and what it comes to, and can be
 * detached to that literal, or re-attached to the template's formula.
 */
export function TokensPanel({ sheet, error, dark, counts, onWrite, onHover, onPreview }: TokensPanelProps) {
  const [filter, setFilter] = useState("");
  return (
    <section aria-label={copy.tokens.title} className="tokens" data-testid="tokens">
      <h2>{copy.tokens.title}</h2>
      {error && <MessageText message={error} />}
      {sheet && (
        <>
          <input aria-label={copy.tokens.filterLabel} placeholder={copy.tokens.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {GROUPS.map((group) => {
            const find = filter.trim().toLowerCase();
            const tokens = sheet.tokens.filter((t) => t.group === group.id && (themeName(t.name).toLowerCase().includes(find) || t.name.includes(find)));
            if (tokens.length === 0) return null;
            return (
              <div key={group.id} className="token-group">
                <h3>{group.label}</h3>
                {group.id === "colour" && (
                  <div className="token-modes muted">
                    <span className={dark ? "" : "is-shown"}>{copy.app.light}</span>
                    <span className={dark ? "is-shown" : ""}>{copy.app.dark}</span>
                  </div>
                )}
                <ul role="list">
                  {tokens.map((token) => (
                    <TokenRow key={token.name} token={token} count={counts?.[token.name] ?? null} onWrite={onWrite} onHover={onHover} onPreview={onPreview} />
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
  onPreview,
}: {
  token: ThemeToken;
  count: number | null;
  onWrite: (writes: TokenWrite[]) => void;
  onHover: (name: string | null) => void;
  onPreview?: ((css: string | null) => void) | undefined;
}) {
  const derived = token.references.length > 0;
  const detached = !derived && token.defaultFormula !== null;
  const write = (value: string, mode: TokenWrite["mode"]) => value.trim() !== "" && onWrite([{ name: token.name, value, mode }]);
  /** A colour value: its swatch opens the picker, which previews on the canvas and writes oklch. */
  const colour = (mode: TokenWrite["mode"], value: string) => {
    // Previews only the mode it belongs to: a light value never shows over dark mode.
    const scope = mode === "dark" ? ":root.dark" : mode === "light" ? ":root:not(.dark)" : ":root";
    const css = (hex: string, opacity: number) => hexToOklch(hex, alphaFor(opacity));
    return (
      <span className="token-value">
        <ColourSwatch
          label={copy.tokens.valueLabel(themeName(token.name), mode)}
          value={value}
          onPreview={(hex, opacity) => onPreview?.(hex === null ? null : `${scope}{${token.name}:${css(hex, opacity)}!important}`)}
          onCommit={(hex, opacity) => write(css(hex, opacity), mode)}
        />
      </span>
    );
  };
  return (
    <li className="token" data-testid={`token-${token.name}`} onPointerEnter={() => onHover(token.name)} onPointerLeave={() => onHover(null)}>
      <div className="token-head">
        <span className="token-name">{themeName(token.name)}</span>
        {count !== null && (
          <Hinted text={copy.tokens.countTitle}>
            <span className="muted small" data-testid="token-count">
              {count}
            </span>
          </Hinted>
        )}
      </div>
      <div className={`token-values${token.dark !== null ? " has-dark" : ""}`}>
        {token.group === "colour" ? (
          <>
            {colour(token.dark !== null ? "light" : null, token.value)}
            {token.dark !== null && colour("dark", token.dark)}
          </>
        ) : (
          <TokenValue label={copy.tokens.valueLabel(themeName(token.name), token.dark !== null ? "light" : null)} value={token.value} onCommit={(v) => write(v, token.dark !== null ? "light" : null)} />
        )}
      </div>
      {(derived || detached) && (
        <div className="token-derived muted small">
          {derived ? (
            <>
              <Hinted text={copy.tokens.derivedTitle}>
                <span>{copy.tokens.resolved(token.resolved)}</span>
              </Hinted>
              <Tooltip text={token.resolved === null ? copy.tokens.cantDetach : copy.tokens.detachTitle(token.resolved)}>
                <button
                  type="button"
                  className="quiet"
                  disabled={token.resolved === null}
                  onClick={() => token.resolved !== null && write(token.resolved, null)}
                >
                  {copy.tokens.detach}
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <span>{copy.tokens.detached}</span>
              <Tooltip text={copy.tokens.attachTitle(token.defaultFormula)}>
                <button type="button" className="quiet" onClick={() => token.defaultFormula && write(token.defaultFormula, null)}>
                  {copy.tokens.attach}
                </button>
              </Tooltip>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TokenValue({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <span className="token-value">
      <TextInput label={label} value={value} onCommit={onCommit} />
    </span>
  );
}

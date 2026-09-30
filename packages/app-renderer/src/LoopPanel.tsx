import { useCallback, useEffect, useState } from "react";
import type { GitDiff, LoopStatus, PassSummary } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

export type LoopAction = "handoff" | "takeBack" | "revert";

/** Where the handoff loop stands (ADR 011), and its actions. */
export function useLoop(projectRoot: string, revision: number) {
  const [status, setStatus] = useState<LoopStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LoopAction | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("loop:status", { projectRoot }).then(
      (next) => !cancelled && setStatus(next),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  const run = useCallback(
    async (action: LoopAction): Promise<LoopStatus | null> => {
      setBusy(action);
      setError(null);
      const channel = action === "handoff" ? "loop:handoff" : action === "takeBack" ? "loop:takeBack" : "loop:revert";
      try {
        const next = await call(channel, { projectRoot });
        setStatus(next);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message.replace(/^loop:\w+: /, "") : String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [projectRoot],
  );
  return { status, error, busy, run };
}

const BUSY: Record<LoopAction, string> = {
  handoff: "Handing off… (checking the build)",
  takeBack: "Taking back… (analysing and building)",
  revert: "Reverting the pass…",
};

/** Hand off and Take back (T5.2, T5.3), with where the loop stands. */
export function LoopPanel({ status, error, busy, openNotes, onHandoff, onTakeBack }: {
  status: LoopStatus | null;
  error: string | null;
  busy: LoopAction | null;
  /** Open notes that will go out as tasks. */
  openNotes: number;
  onHandoff: () => void;
  onTakeBack: () => void;
}) {
  const withAgent = status?.state === "with-agent";
  return (
    <section aria-label="Handoff" className={`loop${withAgent ? " is-with-agent" : ""}`} data-testid="loop">
      <div className="row">
        <strong data-testid="loop-state">{withAgent ? `With agent · handoff #${status?.handoff?.number}` : "With you"}</strong>
      </div>
      {status && !withAgent && (
        <>
          <button type="button" className="primary" disabled={busy !== null} onClick={onHandoff}>
            Hand off
          </button>
          <p className="muted small">
            Handoff #{status.next}: {openNotes} open note{openNotes === 1 ? "" : "s"} go{openNotes === 1 ? "es" : ""} to the agent as tasks in HANDOFF.md.
          </p>
        </>
      )}
      {withAgent && (
        <>
          <button type="button" className="primary" disabled={busy !== null} onClick={onTakeBack}>
            Take back
          </button>
          <p className="muted small">Run your agent on the project (its tasks are in HANDOFF.md), then take it back here.</p>
        </>
      )}
      {busy && <p className="muted small" role="status">{BUSY[busy]}</p>}
      {error && (
        <pre className="loop-error error" role="alert" data-testid="loop-error">
          {error}
        </pre>
      )}
    </section>
  );
}

/**
 * The latest pass (T5.4): what the agent changed and broke, what was repaired, with a
 * per-file diff against the handoff (T5.7) and Revert pass (T5.8).
 */
export function PassPanel({ projectRoot, status, busy, onRevert, onSelectId }: {
  projectRoot: string;
  status: LoopStatus | null;
  busy: LoopAction | null;
  onRevert: () => void;
  onSelectId: (id: string, file: string) => void;
}) {
  const pass = status?.pass ?? null;
  const summary = status?.summary ?? null;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [pass?.commit]);
  if (!pass) {
    return (
      <section aria-label="Pass" className="pass" data-testid="pass">
        <h2>Pass</h2>
        <p className="muted">{status?.state === "with-agent" ? "The agent's pass shows here after Take back." : "No pass to review: take one back first."}</p>
      </section>
    );
  }
  return (
    <section aria-label="Pass" className="pass" data-testid="pass">
      <h2>Pass #{pass.number}</h2>
      {summary ? <Summary summary={summary} onSelectId={onSelectId} /> : <p className="muted small">Taken back in an earlier session: the summary isn't kept, but the diff is.</p>}
      <Diffs projectRoot={projectRoot} from={pass.handoffCommit} to={pass.commit} />
      <div className="pass-revert">
        {!confirming ? (
          <button type="button" className="danger" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Revert pass #{pass.number}…
          </button>
        ) : (
          <div className="confirm" role="alertdialog" aria-label="Revert pass">
            <p>
              Put the project back as it was at handoff #{pass.number}? The agent's work and your edits since take-back are committed first, so they stay in git history.
            </p>
            <div className="row">
              <button type="button" className="danger" onClick={onRevert}>
                Revert
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Summary({ summary: s, onSelectId }: { summary: PassSummary; onSelectId: (id: string, file: string) => void }) {
  const idLink = (id: string, element: string, file: string) => (
    <button type="button" className="link" onClick={() => onSelectId(id, file)}>
      {element} #{id}
    </button>
  );
  return (
    <div className="pass-summary" data-testid="pass-summary">
      <p className={s.build.ok ? "small" : "error small"} data-testid="pass-build">
        {s.build.ok ? `Build passes (${(s.build.ms / 1000).toFixed(1)} s)` : "Build fails"}
      </p>
      {!s.build.ok && <pre className="loop-error">{s.build.output}</pre>}
      <p className="small" data-testid="pass-tasks">
        Tasks: {s.tasks.resolved} of {s.tasks.sent} done{s.tasks.unmatched.length ? `; ${s.tasks.unmatched.length} ticked task${s.tasks.unmatched.length === 1 ? "" : "s"} matched no note` : ""}
        {s.replies.length ? ` · ${s.replies.length} repl${s.replies.length === 1 ? "y" : "ies"}` : ""}
      </p>
      <Group title="Contract breaches" count={s.breaches.length} testid="pass-breaches">
        {s.breaches.map((b, i) => (
          <li key={i}>
            <span className="muted">Rule {b.rule}:</span> {b.text}
            {b.file && <span className="muted"> · {b.file}{b.line ? `:${b.line}` : ""}</span>}
          </li>
        ))}
      </Group>
      <Group title="Repaired" count={s.repairs.length} testid="pass-repairs">
        {s.repairs.map((r, i) => (
          <li key={i}>
            {r.kind === "reminted" ? `Re-minted duplicate ${r.was} → ` : "Gave an ID: "}
            {idLink(r.id, r.element, r.file)}
          </li>
        ))}
      </Group>
      <Group title="Files changed" count={s.files.length} testid="pass-files">
        {s.files.map((f) => (
          <li key={f.path}>
            <code>{f.path}</code> <span className="muted">{f.status === "modified" ? "" : `${f.status} `}+{f.additions} −{f.deletions}</span>
          </li>
        ))}
      </Group>
      <Group title="Elements added" count={s.elementsAdded.length} testid="pass-added">
        {s.elementsAdded.map((e) => (
          <li key={e.id}>{idLink(e.id, e.element, e.file)}</li>
        ))}
      </Group>
      <Group title="Elements removed" count={s.elementsRemoved.length} testid="pass-removed">
        {s.elementsRemoved.map((e) => (
          <li key={e.id}>
            {e.element} #{e.id} <span className="muted">({e.file})</span>
          </li>
        ))}
      </Group>
      {s.orphanedNotes > 0 && <p className="error small">{s.orphanedNotes} note{s.orphanedNotes === 1 ? " is" : "s are"} orphaned: see the tray in Notes.</p>}
      <Group title="New violations" count={s.newViolations.length} testid="pass-violations">
        {s.newViolations.map((v, i) => (
          <li key={i}>
            <code>{v.kind === "inline-style" ? "style={…}" : v.value}</code> <span className="muted">{v.file}:{v.line}</span>
          </li>
        ))}
      </Group>
      <Group title="New locked blocks" count={s.newLockedBlocks.length} testid="pass-locked">
        {s.newLockedBlocks.map((b, i) => (
          <li key={i}>
            🔒 {b.element} <span className="muted">({b.reason}, {b.file}:{b.line})</span>
          </li>
        ))}
      </Group>
      {s.parseErrors.length > 0 && (
        <Group title="Files that don't parse" count={s.parseErrors.length} testid="pass-parse-errors">
          {s.parseErrors.map((e) => (
            <li key={e.file} className="error">
              {e.file}: {e.message}
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, count, testid, children }: { title: string; count: number; testid: string; children: React.ReactNode }) {
  return (
    <details className="pass-group" data-testid={testid} open={count > 0 && count <= 8}>
      <summary>
        {title} <span className="muted">({count})</span>
      </summary>
      {count > 0 && <ul role="list">{children}</ul>}
    </details>
  );
}

/** Per-file diff of the agent's pass (T5.7): handoff → pass. */
function Diffs({ projectRoot, from, to }: { projectRoot: string; from: string; to: string }) {
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    call("git:diff", { projectRoot, from, to }).then(
      (d) => !cancelled && setDiff(d),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, from, to]);
  return (
    <div className="diffs" data-testid="pass-diffs">
      <h3>Diff against the handoff</h3>
      {error && <p className="error small">{error}</p>}
      {diff && diff.files.length === 0 && <p className="muted small">The agent changed nothing.</p>}
      <ul role="list">
        {diff?.files.map((f) => (
          <li key={f.path}>
            <button type="button" className="link" aria-expanded={open === f.path} onClick={() => setOpen((o) => (o === f.path ? null : f.path))}>
              {f.path}
            </button>{" "}
            <span className="muted small">
              +{f.additions} −{f.deletions}
            </span>
            {open === f.path && (
              <pre className="patch" data-testid="patch">
                {f.patch
                  .split("\n")
                  .filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l))
                  .map((line, i) => (
                    <span key={i} className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : undefined}>
                      {line}
                      {"\n"}
                    </span>
                  ))}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

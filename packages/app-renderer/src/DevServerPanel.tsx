import { useCallback, useEffect, useRef, useState } from "react";
import type { DevServerStatus, LogLine } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

const POLL_MS = 500;
const MAX_LINES = 500;

/** Start/stop a project's Vite server and follow its log (T1.3). */
export function DevServerPanel({ projectRoot }: { projectRoot: string }) {
  const [status, setStatus] = useState<DevServerStatus | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);

  const apply = useCallback((next: DevServerStatus) => {
    setStatus(next);
    if (next.logs.length > 0) {
      setLines((prev) => [...prev, ...next.logs].slice(-MAX_LINES));
    }
    lastSeq.current = Math.max(lastSeq.current, next.lastSeq);
  }, []);

  // New project: start from a clean log.
  useEffect(() => {
    lastSeq.current = 0;
    setLines([]);
    setStatus(null);
    setError(null);
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await call("devserver:status", { projectRoot, sinceSeq: lastSeq.current });
        if (!cancelled) apply(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectRoot, apply]);

  async function run(channel: "devserver:start" | "devserver:stop") {
    setError(null);
    try {
      // Status (with any new log lines) arrives through the poll; this just triggers it.
      await call(channel, { projectRoot });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const state = status?.state ?? "stopped";
  const live = state === "starting" || state === "running" || state === "installing";

  return (
    <section className="devserver" aria-label="Dev server">
      <header>
        <h2>Dev server</h2>
        <span className={`state state-${state}`} data-testid="devserver-state">
          {state}
        </span>
        {status?.url && state === "running" && (
          <code data-testid="devserver-url">{status.url}</code>
        )}
        <button type="button" disabled={!projectRoot || live} onClick={() => void run("devserver:start")}>
          Start
        </button>
        <button type="button" disabled={!live} onClick={() => void run("devserver:stop")}>
          Stop
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {status?.lastError && <p className="error" data-testid="devserver-error">{status.lastError}</p>}
      <ol className="log" data-testid="devserver-log">
        {lines.map((line) => (
          <li key={line.seq} className={`log-${line.level} log-${line.stream}`}>
            {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

import type { DevServer } from "./useDevServer.js";

/** A project's Vite server: state, URL, start/stop and its log (T1.3). */
export function DevServerPanel({ server }: { server: DevServer }) {
  const { status, lines, error } = server;
  const state = status?.state ?? "stopped";
  const live = state === "starting" || state === "running" || state === "installing";

  return (
    <section className="devserver" aria-label="Dev server">
      <header>
        <h2>Dev server</h2>
        <span className={`state state-${state}`} data-testid="devserver-state">
          {state}
        </span>
        {status?.url && state === "running" && <code data-testid="devserver-url">{status.url}</code>}
        <button type="button" disabled={live} onClick={() => void server.start()}>
          Start
        </button>
        <button type="button" disabled={!live} onClick={() => void server.stop()}>
          Stop
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {status?.lastError && (
        <p className="error" data-testid="devserver-error">
          {status.lastError}
        </p>
      )}
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

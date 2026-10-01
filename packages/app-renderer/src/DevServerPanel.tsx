import type { DevServer } from "./useDevServer.js";
import { copy } from "./copy.js";
import { MessageText } from "./Toasts.js";

/** A project's Vite server: state, URL, start/stop and its log (T1.3). */
export function DevServerPanel({ server }: { server: DevServer }) {
  const { status, lines, error } = server;
  const state = status?.state ?? "stopped";
  const live = state === "starting" || state === "running" || state === "installing";

  return (
    <section className="devserver" aria-label={copy.devServer.title}>
      <header>
        <h2>{copy.devServer.title}</h2>
        <span className={`state state-${state}`} data-testid="devserver-state">
          {copy.devServer.state(state)}
        </span>
        {status?.url && state === "running" && <code data-testid="devserver-url">{status.url}</code>}
        <button type="button" disabled={live} onClick={() => void server.start()}>
          {copy.devServer.start}
        </button>
        <button type="button" disabled={!live} onClick={() => void server.stop()}>
          {copy.devServer.stop}
        </button>
      </header>
      {error && <MessageText message={error} />}
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

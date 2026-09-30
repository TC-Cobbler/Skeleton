import { useCallback, useEffect, useRef, useState } from "react";
import type { DevServerStatus, LogLine } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

const POLL_MS = 500;
const MAX_LINES = 500;

export interface DevServer {
  status: DevServerStatus | null;
  lines: LogLine[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** Polls a project's dev server status and accumulates its log (see ADR 005). */
export function useDevServer(projectRoot: string, autoStart: boolean): DevServer {
  const [status, setStatus] = useState<DevServerStatus | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);

  useEffect(() => {
    lastSeq.current = 0;
    setLines([]);
    setStatus(null);
    setError(null);
    if (!projectRoot) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await call("devserver:status", { projectRoot, sinceSeq: lastSeq.current });
        if (cancelled) return;
        setStatus(next);
        if (next.logs.length > 0) setLines((prev) => [...prev, ...next.logs].slice(-MAX_LINES));
        lastSeq.current = Math.max(lastSeq.current, next.lastSeq);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    if (autoStart) {
      call("devserver:start", { projectRoot }).catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    }
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectRoot, autoStart]);

  const run = useCallback(
    async (channel: "devserver:start" | "devserver:stop") => {
      setError(null);
      try {
        await call(channel, { projectRoot });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectRoot],
  );

  return { status, lines, error, start: () => run("devserver:start"), stop: () => run("devserver:stop") };
}

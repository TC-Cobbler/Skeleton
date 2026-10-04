import { useEffect, useState } from "react";
import { call } from "./bridge.js";
import { messageFor, type Message } from "./messages.js";

const POLL_MS = 500;

/**
 * The project's file-change revision from main's watcher (T2.6). Moves on any
 * change under src/, whether or not Vite's HMR saw it; stays put while locked.
 */
export function useProjectRevision(projectRoot: string): { revision: number; error: Message | null } {
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<Message | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await call("project:changes", { projectRoot });
        if (cancelled) return;
        setRevision(next.revision);
        setError(next.error === null ? null : messageFor(new Error(next.error)));
      } catch (err) {
        if (!cancelled) setError(messageFor(err));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectRoot]);
  return { revision, error };
}

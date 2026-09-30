import { useMemo, useState, useSyncExternalStore } from "react";

export type GameStatus = "Playing" | "Completed" | "Backlog" | "Dropped";

export type Game = {
  id: string;
  title: string;
  platform: string;
  hoursPlayed: number;
  status: GameStatus;
};

const MOCK_GAMES: Game[] = [
  { id: "g1", title: "Hades", platform: "PC", hoursPlayed: 62, status: "Completed" },
  { id: "g2", title: "The Legend of Zelda: Tears of the Kingdom", platform: "Switch", hoursPlayed: 110, status: "Playing" },
  { id: "g3", title: "Elden Ring", platform: "PS5", hoursPlayed: 145, status: "Completed" },
  { id: "g4", title: "Celeste", platform: "Switch", hoursPlayed: 14, status: "Completed" },
  { id: "g5", title: "Baldur's Gate 3", platform: "PC", hoursPlayed: 38, status: "Playing" },
  { id: "g6", title: "Starfield", platform: "Xbox", hoursPlayed: 9, status: "Dropped" },
  { id: "g7", title: "Hollow Knight", platform: "PC", hoursPlayed: 0, status: "Backlog" },
  { id: "g8", title: "God of War Ragnarök", platform: "PS5", hoursPlayed: 3, status: "Backlog" },
];

export type StatusFilter = GameStatus | "all";

export type NewGame = Omit<Game, "id">;

const STORAGE_KEY = "game-library:added-games";
const OVERRIDES_KEY = "game-library:status-overrides";

function loadAdded(): Game[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Game[]) : [];
  } catch {
    return [];
  }
}

function loadOverrides(): Record<string, GameStatus> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GameStatus>) : {};
  } catch {
    return {};
  }
}

// Shared store so the library and stats stay in sync; added games are newest first.
let added: Game[] = loadAdded();
// Status changes keyed by game id, so they also apply to the built-in mock games.
let overrides: Record<string, GameStatus> = loadOverrides();
let snapshot = { added, overrides };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function emit() {
  snapshot = { added, overrides };
  listeners.forEach((l) => l());
}

function addGame(game: NewGame) {
  added = [{ ...game, id: crypto.randomUUID() }, ...added];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
  } catch {
    // storage unavailable: keep the game in memory only
  }
  emit();
}

function setGameStatus(id: string, status: GameStatus) {
  overrides = { ...overrides, [id]: status };
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // storage unavailable: keep the change in memory only
  }
  emit();
}

export function useAllGames() {
  const { added: addedGames, overrides: statusOverrides } = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(
    () =>
      [...addedGames, ...MOCK_GAMES].map((g) =>
        statusOverrides[g.id] ? { ...g, status: statusOverrides[g.id] } : g,
      ),
    [addedGames, statusOverrides],
  );
}

/** Game library from mock data, filtered by a case-insensitive title query and a status. */
export function useGames() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const allGames = useAllGames();

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allGames.filter(
      (g) =>
        (status === "all" || g.status === status) &&
        (!q || g.title.toLowerCase().includes(q)),
    );
  }, [allGames, query, status]);

  return { games, query, setQuery, status, setStatus, addGame, setGameStatus };
}

/** Aggregate stats over the whole library (ignores filters). */
export function useGameStats() {
  const allGames = useAllGames();
  return useMemo(
    () => ({
      gameCount: allGames.length,
      totalHours: allGames.reduce((sum, g) => sum + g.hoursPlayed, 0),
      completedCount: allGames.filter((g) => g.status === "Completed").length,
    }),
    [allGames],
  );
}

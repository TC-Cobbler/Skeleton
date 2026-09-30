import { useState } from "react";
import { useAllGames } from "@/hooks/use-games";

/** Tracks which game's details sheet is open; looks it up in the full library so filters can't hide it. */
export function useGameDetails() {
  const allGames = useAllGames();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedGame = allGames.find((g) => g.id === selectedId) ?? null;

  return {
    selectedGame,
    open: selectedGame !== null,
    openGame: (id: string) => setSelectedId(id),
    close: () => setSelectedId(null),
  };
}

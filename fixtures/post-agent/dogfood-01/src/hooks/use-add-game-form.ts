import { useState } from "react";
import type { GameStatus, NewGame } from "@/hooks/use-games";

export const PLATFORMS = ["PC", "Switch", "PS5", "Xbox", "Other"];
export const STATUSES: GameStatus[] = ["Playing", "Completed", "Backlog", "Dropped"];

const INITIAL = { title: "", platform: PLATFORMS[0], status: "Backlog" as GameStatus, hours: "" };

/** State for the add-game dialog: form fields, validity, and submit (adds, closes, clears). */
export function useAddGameForm(addGame: (game: NewGame) => void) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL);

  const canSubmit = form.title.trim() !== "";

  const update = <K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!canSubmit) return;
    addGame({
      title: form.title.trim(),
      platform: form.platform,
      status: form.status,
      hoursPlayed: Math.max(0, Number(form.hours) || 0),
    });
    setForm(INITIAL);
    setOpen(false);
  };

  return { open, setOpen, form, update, canSubmit, submit };
}

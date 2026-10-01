// Why something Skeleton was asked to do can't happen, in a form the UI can say in
// plain words (ADR 013). An error's own message stays technical: it names the op and
// the node, for logs, tests and the agent. Errors the user can meet also carry a
// reason: a stable code plus the facts its sentence needs. Errors only a Skeleton bug
// can cause carry none, and the UI shows its catch-all for them.

/** Every reason code. Refusals (the user asked for something that can't be done here) and problems (the project is in a state that blocks it). */
export const REASON_CODES = [
  // Edits on the canvas.
  "inside-agent-code",
  "is-agent-code",
  "agent-control",
  "agent-style",
  "agent-value",
  "text-has-elements",
  "text-has-comment",
  "text-too-long",
  "element-gone",
  "move-into-itself",
  "next-to-text",
  "with-agent",
  "edit-undone",
  // Undo and redo.
  "nothing-to-undo",
  "changed-since",
  // Pages.
  "bad-web-address",
  "web-address-taken",
  "web-address-outside",
  "bad-page-name",
  "page-name-taken",
  "page-name-in-code",
  "page-file-taken",
  "only-page",
  "page-used-elsewhere",
  "page-has-subpages",
  "page-is-default",
  "page-not-renamable",
  "page-missing",
  "page-unreadable",
  "pages-unreadable",
  // The theme and off-theme values.
  "theme-unreadable",
  "bad-theme-value",
  "theme-value-twice",
  "theme-value-missing",
  "theme-name-taken",
  "off-theme-moved",
  "off-theme-in-agent-code",
  // Hand off and take back.
  "already-handed-off",
  "not-handed-off",
  "nothing-to-undo-agent",
  "duplicate-ids",
  "build-broken",
  "file-unreadable",
  "notes-unreadable",
  "note-element-gone",
  // Projects.
  "not-a-skeleton-project",
  "bad-project-name",
  "project-exists",
  "folder-missing",
  "create-failed",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** What a reason's sentence needs: an element's data-ui-id (`id`), a page file (`page`), a web address (`path`)… */
export type ReasonFacts = Readonly<Record<string, string | number>>;

export interface Reason {
  code: ReasonCode;
  facts: ReasonFacts;
}

export const reason = (code: ReasonCode, facts: ReasonFacts = {}): Reason => ({ code, facts });

/** The reason an error carries, or the first one in its chain of causes; null if none does. */
export function reasonOf(err: unknown): Reason | null {
  for (let e = err, depth = 0; e && depth < 8; depth++) {
    if (typeof e !== "object") return null;
    const r = (e as { reason?: unknown }).reason;
    if (r && typeof r === "object" && typeof (r as Reason).code === "string") return r as Reason;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

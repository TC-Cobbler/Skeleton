# 011: The handoff loop

**Status:** accepted · 2026-09-30 · T5.1–T5.8 (applies to all of Phase 5)

## Context

Phase 5 closes the loop (PRD §6, §11, §12): notes pinned to elements, Hand off, the agent's pass, Take back, and review. Constraints:

- **Non-negotiable 1:** no persistent model beside the code. Whether the project is "with the agent" must not live in a file of its own that can drift.
- **Non-negotiables 3 and 4:** take-back repairs touch only the element they repair, and never rewrite an ID that was there before the pass.
- **ADR 003:** git, the filesystem and all parsing stay in main; the pure parts go in core.

## Decisions

**The loop's state is derived from git history.** Skeleton's own commit subjects are the record:

| Subject | Means |
|---|---|
| `skeleton: handoff #N` | With the agent, since this commit |
| `agent: pass #N` | Taken back; this pass can be reviewed and reverted |
| `skeleton: revert pass #N` | The pass was undone; with the user |

The newest of these in `git log` decides the state. The next handoff number is one more than the highest handoff seen. The agent may commit on its own in between; that changes nothing. `agent: pass #N` is committed even when the agent committed everything itself (`--allow-empty`), so the pass is always marked.

**Notes live in `skeleton/notes.json`, keyed by `data-ui-id` (T5.1).** `{ notes: Note[], replies: Reply[] }`.

- A note has an id (`n_` + 6 alphanumerics), a target ID, a type (`build`, `behaviour`, `question`), text (one line), a status (`open`, `resolved`), and the handoff it was last sent in.
- Replies are separate entries (`{ target, text, pass }`), because the agent replies per element, not per note, and may reply about an element that has no note. A reply with no ID in it has `target: null`.
- **Orphaned is derived**, never stored: a note whose target ID isn't in the project's ID index now. The orphan tray (T5.5) lists those; re-attaching sets the target, discarding deletes the note.
- Pins on the canvas are drawn by the overlay from a `notes` host message (element key, counts, whether it has a reply). A click on a pin selects the element and opens the Notes tab.

**Hand off (T5.2)** runs in main, in this order:

1. Refuse if the project is already with the agent, has duplicate IDs, or doesn't build (`pnpm run build`, its output tail in the error).
2. Compile `HANDOFF.md` (core `compileHandoff`) and mark the open, non-orphaned notes as sent in handoff N.
3. Commit everything as `skeleton: handoff #N`.
4. Lock: the watcher ignores changes, the editor refuses every edit, and the renderer shows "With agent".

`HANDOFF.md` is written **before** the commit (the PRD lists the commit first). Otherwise Skeleton's own `HANDOFF.md` would show up in the agent's pass as agent-authored.

"Changes since last handoff" compares the working tree with the newest loop commit (the last pass or revert, else the root commit): pages added and removed, token changes, and elements added and removed. The agent's own work from the last pass is therefore not repeated back to it.

**Take back (T5.3, T5.4, T5.6)**:

1. Commit `agent: pass #N`. This commit is the agent's work only, so the analyser, the pass summary and the diff view (handoff #N → pass #N) all show the agent's changes and nothing of Skeleton's.
2. Run the take-back analyser (core, T0.8) on the handoff commit against the pass commit, and derive the contract breaches from its report plus the pass's file list (rule 6: anything changed under `skeleton/`, or the router or token file deleted).
3. Parse `HANDOFF.md` (core `parseHandoff`). A ticked task resolves its note: first by the same ID, type and text, then by position among that ID's tasks. Replies become reply entries. Notes are read from the handoff commit's `notes.json`, which Skeleton owns; if the agent edited it, that's a reported breach.
4. **Auto-repair** (core `repairIds`):
   - Every duplicated ID keeps its occurrence at the place it had before the pass (same file, else the first in document order). Every other occurrence is re-minted.
   - Editable elements in page files that have no ID get one.
   - Each repair inserts or rewrites one attribute on the element's opening tag and nothing else: no Prettier, no other bytes.
5. Build, unlock, and return the pass summary: files changed, IDs added, removed and orphaned (with their notes), new violations, new locked blocks, breaches, repairs, the tasks ticked, and the build status.

Repairs and the notes update are left **uncommitted**, like any edit after take-back. The next handoff commits them.

**Revert pass (T5.8)** first commits any uncommitted work as `skeleton: edits after pass #N`, so nothing is lost. It then restores the handoff commit's tree as a new commit, `skeleton: revert pass #N` (GitService.revert: history is never rewritten).

**The session's undo stack is cleared** at hand off, take back and revert. Its steps would otherwise cross a loop boundary.

## Consequences

- A project handed off stays locked across restarts of Skeleton, because the state is read from git.
- The pass summary is kept in memory for the session only. After a restart, the diff view and revert still work, because they only need the commits.
- Handoff and take-back each run a full build, which takes seconds. That's acceptable for a deliberate action. Edits still use the incremental check (ADR 009).
- Matching ticks by text means an agent that rewrites a task's text is matched by position instead.

## Amendment: what Gate 5 turned up

- **The selection's label is a grip for moving it.** A canvas drag moves the node under the pointer (ADR 008). A Table is completely covered by its rows and cells, so no point on it grabs the Table itself, and F6 couldn't be done with the mouse. Now the selected element's label on the canvas (`⠿ Table #ui_…`) is a drag handle whenever the element can move. Only a drag that starts on it moves the selection. Presses on content behave as before.
  - The label sits over the element above the selection, and the first full e2e run lost clicks and drops there (Gate 2, compose). So the overlay's hit tests now look through its own layer (`pointAt`): a click, hover or drop where a label, pin or handle is drawn reaches the app element under it.
- **Replacing a placeholder row with new IDs is a breach.** The first scripted agent swapped the placeholder `<TableRow>` for a `.map` whose rows had fresh IDs. That removes three IDs, and take-back reported it as three rule-1 breaches, which is correct. A contract-following agent keeps the row's IDs on the `.map` template (as the Phase 0 agent did), and the gate's scripted pass does that.
- **An element emptied by a move closes on one line.** Moving the Table out of its `CardContent` leaves `<CardContent data-ui-id="…"></CardContent>`. That's the only line outside the moved JSX that changes.

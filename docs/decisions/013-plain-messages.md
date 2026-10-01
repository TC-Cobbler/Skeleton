# 013: Plain messages from reason codes

**Status:** accepted · 2026-10-01 · T8.3 (TASKS.md, v1.0.y; `docs/ui-refresh-spec.md` §4)

## Context

Skeleton's errors are written for developers: `setProp(ui_btn01): prop "variant" carries agent logic and is protected`. The UI refresh is for someone who doesn't know HTML or CSS, so every message has to say what happened and what to do, in the glossary's words. CLAUDE.md also requires that every edit-op error name its op and node, and core's and main's unit tests check those messages.

## Options

1. **Reword at the source.** Core and main write plain sentences. This breaks the "name the op and node" rule, loses what the agent and the logs need, and changes about 10 test files.
2. **Match the text in the renderer.** The renderer pattern-matches technical messages into sentences. Any rewording in core would silently break the mapping.
3. **Reason codes.** Core and main keep their messages. An error the user can meet also carries a stable reason code plus the facts its sentence needs. The renderer turns code and facts into a plain sentence.

## Decision

Option 3.

- **The codes.** `core/src/reasons.ts` lists every code (`REASON_CODES`), about 50 of them. Each is either a **refusal** (the user asked for something that can't be done here) or a **problem** (the project is in a state that blocks it).
  - **Facts** are short keys: `id` (a data-ui-id), `page` (a page file), `path` (a web address), `name`, `round`, and so on.
  - **Which errors get one:** errors only a bug could cause (index out of range, no AST node, …) carry no reason.
- **Carrying the reason.**
  - `EditOpError`, `TokenError`, `NotesError`, `EditRefused`, `EditRolledBack`, `LoopRefused`, `ScaffoldError` and `HandlerError` all take a `reason`.
  - `reasonOf` finds one through an error's chain of causes.
  - `IpcError` gains an optional `reason`. Absent means there's no reason.
- **Wording.**
  - The sentences live in the renderer's copy file (`copy.messages`). It's typed `satisfies Record<ReasonCode, …>`, so a code without a sentence doesn't compile. The plain-words check reads them too.
  - `messages.ts` names the facts by their meaning: elements by element name, pages by page name, folders by their own name. It also marks problems that offer Undo.
- **No reason.** An error without one gets the catch-all. It says "Nothing in your project was changed." when the IPC code means nothing was written, and otherwise points to Details.
- **Details.** Every message has a Details disclosure with the technical text. Copy details puts a block for the agent on the clipboard: what was tried, the page file, the data-ui-id, the reason code and the error. Opening Details keeps a notice on screen.

## Consequences

- Core and main tests still check the technical messages. New tests check the reasons (`core/tests/reasons.test.ts`, `app-main/tests/handlers.test.ts`) and that every code has a sentence (`app-renderer/tests/messages.test.ts`).
- A new user-facing refusal needs a code in `REASON_CODES` and a sentence in the copy file. TypeScript enforces the second.
- The renderer's own refusals (e.g. "It's already first.") are already copy-file sentences. They pass through `messageFor` as they are, with no Details.

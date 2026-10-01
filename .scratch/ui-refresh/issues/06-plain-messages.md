# Rewrite messages and empty states in plain language

Type: grilling
Status: resolved
Blocked by: 02
Part of: [UI refresh map](../map.md)

## Question

Using the inventory's message rows (about 80 main/core messages that reach a toast, plus the renderer's empty states, confirmations, progress lines and refusal reasons) and the vocabulary from ticket 02: what does each kind of message say to Johnny, and where is the plain wording produced?

- **Option 1:** reword at the source (core, app-main), which changes the messages that unit tests assert on.
- **Option 2:** map known error kinds to plain text in the renderer, keeping the technical message behind an "Advanced"/details affordance.

Decide the approach and the tone rules, and write a representative set of rewrites (one per message family).

## Answer

Settled with Johnny in two grilling rounds (all recommendations taken).

### Where the plain wording comes from

- **Hybrid.** Core and app-main keep their technical messages: CLAUDE.md requires edit-op errors to name the op and node, and their unit tests stay as they are. Each error Johnny can meet also carries a stable **reason code** (e.g. `inside-agent-code`, `agent-control`, `build-broken`, `already-handed-off`) and the few facts its sentence needs (element ID, page, web address, round).
- The **renderer** has one message table: reason code plus facts gives a plain sentence. It names elements by their element name (Button "Add game"), using the Layers tree. A unit test fails if any reason code has no sentence.
- The **overlay** never builds wording: the host sends finished text, e.g. for handle refusals.
- **Unmapped or unexpected errors** get a plain catch-all: "Skeleton couldn't do that. Nothing in your project was changed." (or "…Something went wrong; see Details." when it isn't known that nothing changed).

### Three tiers

1. **Refusal:** an expected "can't do that here" that Johnny can trigger. Each has its own sentence.
2. **Problem:** the project is in a state that blocks something (the app won't build, a file can't be read, the app won't start). Each has its own sentence plus an action: Undo, Restart, or Copy details.
3. **Skeleton fault:** internal checks Johnny can't cause (index out of range, no AST node, placeholder not found…). All of these share the catch-all.

Only tiers 1 and 2 need reason codes, which comes to about 45 entries.

### Prevent before refuse

Where the UI already knows an action will be refused, the control is disabled and its tooltip gives the reason. The tooltip uses the **same sentence from the same table**. The message remains as a backstop.

### Details

- Every message has a **Details** disclosure showing the technical text, plus a **Copy details** button. Opening Details stops the message auto-dismissing.
- Copy details produces a short block written for pasting to the agent: what Johnny tried, the page file, the element's `data-ui-id`, and the technical message. This is the one place plumbing words are welcome.
- A log of past errors under Advanced is not part of this refresh.

### Tone rules

1. Say what happened, then what to do: one or two short sentences, with a next step when there is one.
2. Use glossary words only: no file names, IDs, `className`, "token", "pass", "build", "commit" or "dev server". Name elements by their element name.
3. Say whether anything changed ("Nothing was changed.", "Skeleton undid it.").
4. No blame and no drama: no "Error:", "Invalid", "failed", "!" or "Oops". Use "Can't…" or "Skeleton couldn't…", never "You can't…".
5. Address Johnny as "you"; the AI is "the agent".
6. Use sentence case with a full stop. Buttons are verbs ("Delete page"), never "OK" or "Yes".

Empty states say what goes here and how to fill it. Progress lines say what's happening in Johnny's terms. Confirmations name the thing and the consequence, with a verb button.

### Representative rewrites (approved)

| Family | Now | Plain |
|---|---|---|
| Edit refusal: agent code | `move(ui_ab12c): ui_ab12c is inside a locked block` | Can't change Button "Add game": it's inside agent code (a repeated list). You can move or delete the whole repeated list instead. |
| Edit refusal: agent control | `prop "onClick" carries agent logic and is protected` | Can't change what Button "Add game" does when clicked: the agent's code decides that. |
| Edit refusal: agent value | `its text includes an expression (agent logic)…` | Can't edit this text: the agent's code fills it in. |
| Drop / move | `Can't drop there: Card has no data-ui-id.` | Can't drop into Card yet: it was added outside Skeleton, and Skeleton will recognise it after the next Take back. |
| Undo | `can't undo "Set gap": src/pages/Library.tsx changed since` | Can't undo "Change space between items": the Library page has changed since then, probably by the agent. Undoing now would lose that change. |
| Undone edit | `The edit was undone because it broke the typecheck: …` | Skeleton undid that change because it would have broken your app. Nothing was changed. *(Details)* |
| Pages: input | `"/Foo" isn't a page path: use lowercase…` | A web address uses lowercase words and dashes, like /orders or /orders/archive. |
| Pages: refusal | `it's the only page` / `Stats.tsx is imported by …` | Can't delete the only page. Add another page first. / Can't delete the Stats page: other parts of your app use it. Ask the agent to remove those first. |
| Pages: problem | `router doesn't parse: …` | Skeleton can't read your app's list of pages, so pages can't be changed right now. *(Copy details)* |
| Theme | `--primary is defined in several blocks` | Can't change Main colour: the theme sets it in more than one place. *(Copy details)* |
| Hand off | `The project is already with the agent (handoff #3).` | The project is already with the agent (round 3). Take it back first. |
| Hand off: problem | `The project doesn't build, so it can't be handed off: …` | Can't hand off: your app has a problem in its code and won't start. *(Undo · Copy details)* |
| Take back | `The project isn't with the agent: nothing to take back.` | There's nothing to take back: the project isn't with the agent. |
| Take back: problem | `A source file doesn't parse: …` | Can't take back yet: the agent left the Library page in a state Skeleton can't read. Ask the agent to fix it, then try again. Nothing was changed. *(Copy details)* |
| App preview | `Vite isn't installed…` / `dev server task failed: …` | Your app can't start because some of what it needs isn't installed. *(Copy details)* / Your app stopped. *(Restart · Copy details)* |
| Project | `{folder} isn't a Skeleton project…` | {folder} wasn't made with Skeleton, so it can't be opened here. |
| Handles | `Can't: its padding isn't a step of the spacing scale` | Can't drag this: its inner space is a custom size, not a theme size. Pick a theme size first. |
| Skeleton fault | `insert(ui_ab12c): index 4 out of range (0..3)` | Skeleton couldn't do that. Nothing in your project was changed. *(Details)* |

| Empty state / progress / confirmation now | Plain |
|---|---|
| Nothing selected. | Click an element on the page to change it. |
| No notes here. | No notes yet. Select an element and add a note for the agent. |
| No pass to review: take one back first. | The agent's work shows here after you take the project back. |
| No overrides: everything is styled with tokens. | Everything follows the theme. |
| No properties to edit here. | This element has no settings. |
| No recent projects. | No projects yet. Create one to get started. |
| Starting the dev server… | Starting your app… |
| Writing files, installing dependencies, making the first commit… | Creating your project. This takes about half a minute. |
| Handing off… (checking the build) | Handing off: checking your app still works… |
| Taking back… (analysing and building) | Taking back: reviewing the agent's work… |
| Reverting the pass… | Undoing the agent's work… |
| Delete Stats and src/pages/Stats.tsx? · Delete page / Cancel | Delete the Stats page? Its web address /stats will stop working. · Delete page / Cancel |
| This deletes agent code too: … · Delete anyway | This also deletes agent code the app may rely on: … · Delete anyway / Cancel |

The full table (every tier 1 and 2 reason code) is written in the spec ticket, following these rules and examples.

### For other tickets

- **Tests:** core and app-main unit tests keep asserting technical messages. Only the renderer and e2e tests see the new sentences, plus a new test that every code has a sentence.
- **Spec:** reason codes on errors are a small cross-package change, worth an ADR in the build phase (keep technical errors, add codes, plain text in the renderer).

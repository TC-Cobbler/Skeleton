# Skeleton

Skeleton is a desktop app for laying out and styling a React app's interface while an AI agent writes its logic. This glossary holds the plain words Skeleton shows on screen. The user doesn't know HTML or CSS, so every term must make sense without that.

Files, commit subjects, the agent contract and `data-ui-id` keep their technical names; these words are for what's on screen.

## The hand-off cycle

**Hand off**:
Giving the project to the agent, with your notes as its tasks.
_Avoid_: Send, submit

**Take back**:
Getting the project back from the agent and reviewing what it did.
_Avoid_: Receive, pull

**Round**:
One hand off plus the take back that follows it, numbered from 1.
_Avoid_: Pass, handoff #, turn, iteration

**Agent's work**:
What the agent changed in a round, as reviewed after Take back.
_Avoid_: Pass, diff, changeset

**Rules the agent broke**:
Changes in the agent's work that go against the project's rules for agents, such as editing the theme.
_Avoid_: Contract breaches, violations

**Fixed by Skeleton**:
Problems Skeleton corrected on Take back so it can keep telling every element apart.
_Avoid_: Repaired, re-minted, auto-repair

**New agent code**:
Agent code that appeared in a round.
_Avoid_: New locked blocks

**Undo the agent's work**:
Putting the project back as it was when it was handed off in that round.
_Avoid_: Revert pass

**Agent is working**:
The state between Hand off and Take back, when the canvas can't be edited.
_Avoid_: Locked, with agent

## What's on the page

**Element**:
One thing on a page, such as a button, a row, a card or a heading.
_Avoid_: Node, component, tag

**Agent code**:
Part of a page the agent wrote as code, such as a repeated list or something that only shows sometimes. You can move or delete it whole, and style what's inside it, but Skeleton won't rewrite it.
_Avoid_: Locked block, locked, protected, logic-bearing

**Agent controls**:
The parts of an element the agent's code decides, such as what happens on click. Shown in plain words and read-only.
_Avoid_: Agent logic, protected props, onClick

**Element name**:
How an element is named on screen: its kind plus its visible text when that tells it apart, e.g. Button "Add game".
_Avoid_: ID, data-ui-id, `#ui_…`

## Design

**Theme**:
The project's shared colours and sizes, defined once and used throughout the app.
_Avoid_: Tokens, design tokens, CSS variables, swatches

**Theme value**:
One entry in the theme, such as a theme colour or a theme size.
_Avoid_: Token, variable

**Theme value name**:
The plain name a theme value is shown under, e.g. Main colour, Text on main colour, Card corners.
_Avoid_: CSS variable name, `--primary`

**Follows**:
A theme value that is worked out from another one, e.g. Card corners follows Corner radius.
_Avoid_: Derived, formula, linked

**Own value**:
A theme value set directly rather than following another.
_Avoid_: Detached

**Off-theme**:
A colour or size set by hand on an element instead of coming from the theme.
_Avoid_: Violation, override, arbitrary value

**Closest theme value**:
The theme value nearest to an off-theme one, offered as its replacement.
_Avoid_: Nearest token, snap target

**Add to theme**:
Turning an off-theme value into a new theme value.
_Avoid_: Promote

**Leave as is**:
Accepting an off-theme value, so it stops being listed.
_Avoid_: Keep, acknowledge

**Reach**:
How far a handle drag's change spreads: All buttons (every element of that kind), Whole theme, or Just this one.
_Avoid_: Scope, component/global/instance, Drag/Shift/Alt

**App theme**:
Whether the app being built is shown in light mode or dark mode. Skeleton's own interface is always dark.
_Avoid_: Colour mode, light/dark (unqualified)

**Light mode** / **Dark mode**:
The two versions of the app theme; a theme colour can differ between them.
_Avoid_: Light/dark value, `.dark`

## Canvas

**Edit**:
The canvas mode where clicking selects an element to change.
_Avoid_: Select mode

**Try it**:
The canvas mode where the app behaves as it will for its users: buttons work and menus open.
_Avoid_: Interact mode, preview mode

**Your app**:
The app being built, as it runs inside the canvas.
_Avoid_: Dev server, Vite, preview server

**App preview**:
The running copy of your app that the canvas shows, with its start and stop controls and its log.
_Avoid_: Dev server

## Notes

**Note**:
A request or question for the agent, pinned to an element. Its type is Build, Behaviour or Question.
_Avoid_: Comment, task (on screen), intent note

**Notes without an element**:
Notes whose element was deleted, waiting to be attached to another element or deleted.
_Avoid_: Orphaned notes, orphans

## Layout

**Column**:
A layout element whose items are arranged one below another.
_Avoid_: Stack (vertical), vertical stack, flex column

**Row**:
A layout element whose items sit side by side.
_Avoid_: Stack (horizontal), horizontal stack, flex row

**Grid**:
A layout element whose items are arranged in equal columns.

**Page width**:
A layout element that centres its content and stops it getting too wide.
_Avoid_: Container

**Push apart**:
An empty layout element that takes up spare room, pushing its neighbours away from each other.
_Avoid_: Spacer

**Arrange**:
The direction a Column or Row lays out its items: Down or Across.
_Avoid_: Direction, flex-direction

**Space between items**:
The gap between the items of a Column, Row or Grid.
_Avoid_: Gap

**Inner space**:
The room between an element's edge and its content, set for the sides or the top and bottom.
_Avoid_: Padding, padding X/Y

**Line up**:
How items sit across a Column or Row: Start, Centre, End or Stretch.
_Avoid_: Align, align-items

**Spread**:
How items are placed along a Column or Row: Start, Centre, End or Space between.
_Avoid_: Justify, justify-content

**Wrap onto new lines**:
Whether a Row's items move onto a new line when they don't fit.
_Avoid_: Wrap, flex-wrap

## Adding elements

**Add**:
The panel of elements you can drag onto the canvas, grouped as Layout, Inputs, Display, Overlays and Navigation.
_Avoid_: Palette, components

## Element settings

**Setting**:
One option of an element shown in Properties, with a plain label, e.g. Style, Size, Starts open, Close button.
_Avoid_: Prop, property name, variant, attribute

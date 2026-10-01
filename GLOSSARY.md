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

## Element settings

**Setting**:
One option of an element shown in Properties, with a plain label, e.g. Style, Size, Starts open, Close button.
_Avoid_: Prop, property name, variant, attribute

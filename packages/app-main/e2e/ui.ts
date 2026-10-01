// Named lookups for Skeleton's own UI (T8.1, docs/ui-refresh-spec.md §7). Tests find
// things by role and visible name, and the names come from the renderer's copy file,
// so a wording change is made there once. Things with no words (canvas frames, layer
// rows, handles) keep their data-testid.

import type { Page } from "playwright-core";
import { copy } from "../../app-renderer/src/copy.js";
import { say } from "../../app-renderer/src/messages.js";
import { copy as canvasCopy } from "../../overlay/src/copy.js";

/** The renderer's words, the overlay's words on the canvas, and a reason's plain sentence. */
export { canvasCopy, copy, say };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A name that starts with `text`: tabs and toggles that add a count, e.g. "Notes (2)". */
export const startsWith = (text: string) => new RegExp(`^${escapeRegExp(text)}`);

/** A pattern from literal text (escaped) and regex pieces, in order. */
export const pattern = (...parts: (string | RegExp)[]) => new RegExp(parts.map((p) => (typeof p === "string" ? escapeRegExp(p) : p.source)).join(""));

export type InspectorTab = keyof typeof copy.app.tabs;
export type PreviewWidth = keyof typeof copy.app.layouts;

/** Skeleton's window, by what's on screen. Every lookup is lazy, like any Playwright locator. */
export function ui(page: Page) {
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const region = (name: string) => page.getByRole("region", { name, exact: true });
  return {
    // The project picker (T1.4).
    picker: {
      changeFolder: () => button(copy.picker.change),
      projectName: () => page.getByLabel(copy.picker.projectName),
      create: () => button(copy.picker.create),
      openFolder: () => button(copy.picker.openFolder),
      newProject: () => page.getByRole("heading", { name: copy.picker.newProject }),
      recent: () => page.getByRole("list", { name: copy.picker.recent }),
    },
    /** Fills in and submits the new-project form, with the folder dialog already stubbed. */
    createProject: async (name: string) => {
      await button(copy.picker.change).click();
      await page.getByLabel(copy.picker.projectName).fill(name);
      await button(copy.picker.create).click();
    },
    closeProject: () => button(copy.app.closeProject),

    // The canvas toolbar.
    selectMode: () => button(copy.app.selectMode),
    interactMode: () => button(copy.app.interactMode),
    history: () => page.getByRole("group", { name: copy.app.history }),
    undo: () => button(copy.app.undo),
    redo: () => button(copy.app.redo),
    previewWidth: (width: PreviewWidth) => button(copy.app.layouts[width]),
    colourMode: () => page.getByRole("group", { name: copy.app.colourMode }),
    light: () => button(copy.app.light),
    dark: () => button(copy.app.dark),

    // Hand off and Take back (T5.2, T5.3).
    handOff: () => button(copy.loop.handOff),
    takeBack: () => button(copy.loop.takeBack),

    // Panels.
    palette: () => region(copy.palette.title),
    pages: () => region(copy.pages.title),
    pagesList: () => page.getByRole("listbox", { name: copy.pages.list }),
    layers: () => region(copy.layers.title),
    layersTree: () => page.getByRole("tree", { name: copy.layers.tree }),
    selection: () => region(copy.selection.title),
    properties: () => region(copy.properties.title),
    tokens: () => region(copy.tokens.title),
    violations: () => region(copy.violations.title),
    notes: () => region(copy.notes.title),
    addNote: () => page.getByRole("form", { name: copy.notes.addForm }),
    viewSource: () => button(copy.viewSource.show),
    hideSource: () => button(copy.viewSource.hide),
    devServer: {
      start: () => button(copy.devServer.start),
      stop: () => button(copy.devServer.stop),
    },

    /** The latest error message's sentence (Details aside). */
    lastError: () => page.getByTestId("edit-error").last().locator(".toast-text"),

    /** An inspector tab, whatever count it shows. */
    tab: (tab: InspectorTab) => page.getByRole("tab", { name: startsWith(copy.app.tabs[tab](0)) }),
  };
}

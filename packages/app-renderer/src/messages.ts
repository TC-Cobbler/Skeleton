// Errors in plain words (T8.3, ADR 013, spec §4). Main and core keep their technical
// messages; an error the user can meet also carries a reason code and facts, and this
// turns it into the sentence from the copy file. The technical message is kept for
// Details and Copy details.

import type { IpcError, Reason, ReasonCode, ReasonFacts } from "@skeleton/app-main/ipc";
import { BridgeError } from "./bridge.js";
import { copy, type Named } from "./copy.js";

/** Refusal: the user asked for something that can't be done here. Problem: the project blocks it. Fault: only a bug could cause it. */
export type Tier = "refusal" | "problem" | "fault";
/** What a message offers besides Details: undo the last change. */
export type MessageAction = "undo";

export interface Message {
  text: string;
  tier: Tier;
  actions: readonly MessageAction[];
  /** The technical text, for Details; null for the renderer's own refusals. */
  details: string | null;
  /** The block Copy details puts on the clipboard; null when there are no details. */
  copy: string | null;
}

/** Problems, and the action each offers. Every other code is a refusal. */
const PROBLEMS: Partial<Record<ReasonCode, readonly MessageAction[]>> = {
  "edit-undone": [],
  "build-broken": ["undo"],
  "duplicate-ids": ["undo"],
  "page-unreadable": [],
  "pages-unreadable": [],
  "theme-unreadable": [],
  "theme-value-twice": [],
  "theme-value-missing": [],
  "file-unreadable": [],
  "notes-unreadable": [],
  "create-failed": [],
};

export const tierOf = (code: ReasonCode): Tier => (code in PROBLEMS ? "problem" : "refusal");

/** What the page shows, for naming elements and the page in a message. */
export interface MessageContext {
  /** The element with this data-ui-id on the page on screen, if it's there. */
  element?: (id: string) => { name: string; text: string | null } | null;
  /** The page file on screen. */
  page?: string | null;
  /** What the user tried, in a few words, for Copy details. */
  tried?: string;
}

const str = (facts: ReasonFacts, key: string): string => {
  const v = facts[key];
  return v === undefined ? "" : String(v);
};

/** A reason's facts, named the way the copy file's sentences need them. */
export function named(facts: ReasonFacts, ctx: MessageContext = {}): Named {
  const id = str(facts, "id");
  const element = id ? ctx.element?.(id) : null;
  const page = str(facts, "page");
  const name = str(facts, "name");
  const direction = str(facts, "direction") === "redo" ? "redo" : "undo";
  return {
    el: element ? copy.named.elementName(element.name, element.text) : copy.named.thatElement,
    page: page ? copy.named.pageName(page) : name ? copy.named.pageComponent(name) : "",
    path: str(facts, "path"),
    name: name ? copy.named.pageComponent(name) : "",
    theme: copy.tokens.tokenName(name),
    round: Number(facts["round"] ?? 0),
    max: Number(facts["max"] ?? 0),
    edit: str(facts, "edit"),
    direction,
    folder: copy.named.folder(str(facts, "folder")),
    parent: str(facts, "parent"),
  };
}

/** The plain sentence for a reason. */
export const say = (reason: Reason, ctx: MessageContext = {}): string => copy.messages[reason.code](named(reason.facts, ctx));

/** Nothing was written for these (ADR 003, ADR 011): a fault there changed nothing. */
const UNCHANGED: ReadonlySet<IpcError["code"]> = new Set(["bad-request", "edit-refused", "not-found", "untrusted-sender"]);

/**
 * Any error, as a message: its reason's sentence, or the catch-all. A plain string is
 * one of the renderer's own refusals, already in the copy file's words.
 */
export function messageFor(err: unknown, ctx: MessageContext = {}): Message {
  if (typeof err === "string") return { text: err, tier: "refusal", actions: [], details: null, copy: null };
  const ipc = err instanceof BridgeError ? err.ipc : null;
  const technical = ipc ? ipc.message : err instanceof Error ? err.message : String(err);
  const reason = ipc?.reason ?? null;
  const block = copy.details.block({
    tried: ctx.tried ?? ipc?.channel ?? "an action",
    page: str(reason?.facts ?? {}, "page") || ctx.page || null,
    id: str(reason?.facts ?? {}, "id") || null,
    code: reason?.code ?? null,
    message: technical,
  });
  if (reason) {
    return { text: say(reason, ctx), tier: tierOf(reason.code), actions: PROBLEMS[reason.code] ?? [], details: technical, copy: block };
  }
  const text = ipc && UNCHANGED.has(ipc.code) ? copy.fault.unchanged : copy.fault.unknown;
  return { text, tier: "fault", actions: [], details: technical, copy: block };
}

/** A message for a reason main reported as data rather than as an error, e.g. a pages list it couldn't read. */
export function messageForReason(reason: Reason, technical: string, ctx: MessageContext = {}): Message {
  return messageFor(new BridgeError({ code: "failed", channel: ctx.tried ?? "read", message: technical, reason }), ctx);
}

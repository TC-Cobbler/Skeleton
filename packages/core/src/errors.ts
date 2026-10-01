import type { Reason } from "./reasons.js";

/**
 * Every failure from an edit op names the op and the node it was working on. One the
 * user can cause also carries a reason, for the UI's plain words (ADR 013).
 */
export class EditOpError extends Error {
  readonly op: string;
  readonly target: string;
  readonly reason: Reason | null;

  constructor(op: string, target: string, message: string, options?: { cause?: unknown; reason?: Reason }) {
    super(`${op}(${target}): ${message}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "EditOpError";
    this.op = op;
    this.target = target;
    this.reason = options?.reason ?? null;
  }
}

/** Source could not be parsed as TSX. */
export class ParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ParseError";
  }
}

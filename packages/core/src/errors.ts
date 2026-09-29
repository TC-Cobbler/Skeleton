/** Every failure from an edit op names the op and the node it was working on. */
export class EditOpError extends Error {
  readonly op: string;
  readonly target: string;

  constructor(op: string, target: string, message: string, options?: { cause?: unknown }) {
    super(`${op}(${target}): ${message}`, options);
    this.name = "EditOpError";
    this.op = op;
    this.target = target;
  }
}

/** Source could not be parsed as TSX. */
export class ParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ParseError";
  }
}

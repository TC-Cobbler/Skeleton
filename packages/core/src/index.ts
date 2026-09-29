// Headless core: parser, edit ops, ID system, token writer, analyser.
// Pure functions only. No Electron, DOM or filesystem imports.

export { EditOpError, ParseError } from "./errors.js";
export { parseModule, printModule, parseJsxExpression } from "./parse.js";
export { diffSources, type SourceDiff, type DiffHunk } from "./diff.js";
export {
  UI_ID_ATTR,
  UI_ID_PATTERN,
  isUiId,
  mintId,
  collectIds,
  buildIdIndex,
  type Random,
  type IdIndex,
  type IdOccurrence,
} from "./ids.js";
export {
  buildTree,
  findNodeById,
  walkTree,
  DEFAULT_CATALOGUE,
  type Catalogue,
  type NodeKind,
  type PageTree,
  type SourceRange,
  type UiNode,
} from "./tree.js";
export {
  insert,
  move,
  remove,
  setProp,
  setClass,
  type EditResult,
  type NodeRef,
  type OpOptions,
  type PropValue,
  type RemoveOptions,
} from "./ops.js";
export { readTokens, writeTokens, TokenError, type Token, type TokenBlock, type TokenUpdate } from "./tokens.js";

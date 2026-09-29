// Headless core: parser, edit ops, ID system, token writer, analyser.
// Pure functions only. No Electron, DOM or filesystem imports.

export const UI_ID_PATTERN = /^ui_[a-z0-9]{5}$/;

export function isUiId(value: string): boolean {
  return UI_ID_PATTERN.test(value);
}

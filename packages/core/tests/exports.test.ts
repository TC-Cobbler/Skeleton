import { describe, expect, it } from "vitest";
import { exportedNames } from "../src/index.js";

describe("exportedNames", () => {
  it("lists declarations, specifiers and re-exports, skipping types", () => {
    const source = `
export { Container } from "./Container";
export { Stack as Row } from "./Stack";
export function Grid() {}
export const Spacer = () => null, other = 1;
function Card() {}
export { Card };
export type { Props } from "./types";
export { type Hidden, Shown } from "./mixed";
export interface Nope {}
export default Card;
`;
    expect(exportedNames(source)).toEqual(["Container", "Row", "Grid", "Spacer", "other", "Card", "Shown", "default"]);
  });
});

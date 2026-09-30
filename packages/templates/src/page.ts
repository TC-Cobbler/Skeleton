// New pages (T3.6): the same shape as the scaffolded home page, a Container holding
// a Stack with the page's title, with IDs minted against the project's.

import { mintId, type Random } from "@skeleton/core";

const PAGE_NAME = /^[A-Za-z][A-Za-z0-9 ]{0,47}$/;

/** Why `name` can't name a page, or null if it can. Names become titles, components and paths. */
export function pageNameError(name: string): string | null {
  if (name.trim() !== name) return "Name can't start or end with a space.";
  if (!PAGE_NAME.test(name)) return "Use 1–48 letters, digits and spaces, starting with a letter.";
  return null;
}

/** "Order history" → "OrderHistoryPage" (a name already ending in "Page" keeps it). */
export function componentFor(name: string): string {
  const pascal = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join("");
  return pascal.endsWith("Page") ? pascal : `${pascal}Page`;
}

/** "Order history" → "/order-history". */
export function pathFor(name: string): string {
  return `/${name.trim().toLowerCase().split(/\s+/).join("-")}`;
}

/** Source of a new page file. `taken` holds the project's IDs; minted ones are added to it. */
export function renderPage(name: string, taken: Set<string>, random?: Random): string {
  const error = pageNameError(name);
  if (error) throw new Error(`invalid page name ${JSON.stringify(name)}: ${error}`);
  const id = () => mintId(taken, random);
  return `import { Container, Stack } from "@/components/layout";

export default function ${componentFor(name)}() {
  return (
    <Container data-ui-id="${id()}">
      <Stack data-ui-id="${id()}" className="gap-6 py-8">
        <h1 data-ui-id="${id()}" className="text-3xl font-semibold">
          ${name}
        </h1>
      </Stack>
    </Container>
  );
}
`;
}

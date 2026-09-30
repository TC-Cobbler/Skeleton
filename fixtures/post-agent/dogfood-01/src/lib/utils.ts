import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system names a radius per component (rounded-button, rounded-card…,
// see globals.css). Tell tailwind-merge they're radii, so a className override such
// as rounded-[14px] replaces a component's own radius instead of both applying.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: [(value: string) => /^[a-z][a-z0-9-]*$/.test(value)] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

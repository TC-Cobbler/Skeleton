import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type StackProps = ComponentProps<"div"> & {
  direction?: "vertical" | "horizontal";
};

/**
 * Auto-layout primitive. Direction is a prop; gap, padding, alignment,
 * justification and wrap are Tailwind classes on `className`.
 */
export function Stack({ direction = "vertical", className, ...props }: StackProps) {
  return (
    <div
      className={cn("flex", direction === "vertical" ? "flex-col" : "flex-row", className)}
      {...props}
    />
  );
}

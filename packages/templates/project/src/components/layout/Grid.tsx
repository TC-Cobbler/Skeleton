import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Grid primitive. Column count and gap are Tailwind classes on `className` (`grid-cols-3 gap-4`). */
export function Grid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid", className)} {...props} />;
}

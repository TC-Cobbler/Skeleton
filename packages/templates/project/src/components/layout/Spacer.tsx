import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Takes up the free space in a Stack, pushing its siblings apart. */
export function Spacer({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("flex-1", className)} {...props} />;
}

import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { OrderStatus } from "@/hooks/useOrders";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  paid: "default",
  pending: "outline",
  refunded: "destructive",
};

/** Badge variant for an order status, so each status is visually distinct. */
export function orderStatusBadgeVariant(status: OrderStatus): BadgeVariant {
  return STATUS_BADGE_VARIANTS[status];
}

import type { OrderStatus } from "@/hooks/useOrders";

const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
};

/** Human-readable label for an order status, e.g. "paid" → "Paid". */
export function formatStatus(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

const STATUS_BADGE_VARIANTS: Record<OrderStatus, "default" | "outline" | "destructive"> = {
  paid: "default",
  pending: "outline",
  refunded: "destructive",
};

/** Badge variant for an order status, so each status reads differently at a glance. */
export function statusBadgeVariant(status: OrderStatus): "default" | "outline" | "destructive" {
  return STATUS_BADGE_VARIANTS[status];
}

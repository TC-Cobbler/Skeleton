import { useMemo } from "react";
import type { Order } from "@/hooks/useOrders";

/**
 * The `limit` most recently added orders, newest first. `useOrders` appends new
 * orders to the end of the list, so insertion order is the add order. When the
 * API exists, sort by its created timestamp instead.
 */
export function useRecentOrders(orders: Order[], limit = 5): Order[] {
  return useMemo(() => orders.slice(-limit).reverse(), [orders, limit]);
}

import { useMemo } from "react";
import type { Order } from "@/hooks/useOrders";

/**
 * The `limit` most recently added orders, newest first. Orders have no
 * timestamp yet, so "most recent" means highest id (ids are assigned
 * incrementally as orders are added).
 */
export function useRecentOrders(orders: Order[], limit = 5): Order[] {
  return useMemo(() => [...orders].sort((a, b) => b.id - a.id).slice(0, limit), [orders, limit]);
}

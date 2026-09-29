import { useMemo, useState } from "react";
import type { Order, OrderStatus } from "@/hooks/useOrders";

export type OrderFilter = "all" | OrderStatus;

/** Holds the active status filter and the orders it lets through. */
export function useOrderFilter(orders: Order[]) {
  const [filter, setFilter] = useState<OrderFilter>("all");

  const visibleOrders = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  return { filter, setFilter, visibleOrders };
}

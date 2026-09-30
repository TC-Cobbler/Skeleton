import { useCallback, useMemo, useState } from "react";
import type { Order, OrderStatus } from "@/hooks/useOrders";

export type OrderFilter = "all" | OrderStatus;

/**
 * Status filter plus customer-name search for the orders table. "all" shows
 * every status; the search is a case-insensitive "contains" match on the
 * customer name (ignoring surrounding whitespace). Both apply together.
 * `isFiltered` is true when either narrows the list; `clearFilters` resets
 * the filter to "all" and empties the search.
 */
export function useOrderFilter(orders: Order[]) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");

  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (needle === "" || o.customer.toLocaleLowerCase().includes(needle)),
    );
  }, [orders, filter, search]);

  const isFiltered = filter !== "all" || search.trim() !== "";

  const clearFilters = useCallback(() => {
    setFilter("all");
    setSearch("");
  }, []);

  return { filter, setFilter, search, setSearch, visibleOrders, isFiltered, clearFilters };
}

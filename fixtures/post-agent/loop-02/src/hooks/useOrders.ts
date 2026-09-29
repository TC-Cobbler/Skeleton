import { useCallback, useMemo, useState } from "react";

export type OrderStatus = "paid" | "pending" | "refunded";

export type Order = {
  id: number;
  customer: string;
  /** Integer amount in pence. */
  total: number;
  status: OrderStatus;
};

export type NewOrderInput = Pick<Order, "customer" | "total">;

/** In-memory stand-in for GET /api/orders. */
const MOCK_ORDERS: Order[] = [
  { id: 1001, customer: "Ada Lovelace", total: 4200, status: "paid" },
  { id: 1002, customer: "Alan Turing", total: 1899, status: "pending" },
  { id: 1003, customer: "Grace Hopper", total: 12550, status: "paid" },
  { id: 1004, customer: "Katherine Johnson", total: 7300, status: "refunded" },
  { id: 1005, customer: "Tim Berners-Lee", total: 2575, status: "paid" },
  { id: 1006, customer: "Margaret Hamilton", total: 9999, status: "pending" },
  { id: 1007, customer: "Edsger Dijkstra", total: 650, status: "paid" },
  { id: 1008, customer: "Barbara Liskov", total: 31000, status: "paid" },
];

/**
 * Orders state. Currently backed by an in-memory mock; shaped so `orders`
 * can later come from GET /api/orders and `addOrder` can POST to it.
 */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);

  const addOrder = useCallback((input: NewOrderInput) => {
    setOrders((current) => {
      const nextId = current.reduce((max, o) => Math.max(max, o.id), 1000) + 1;
      return [...current, { id: nextId, customer: input.customer, total: input.total, status: "pending" }];
    });
  }, []);

  const paidRevenue = useMemo(
    () => orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + o.total, 0),
    [orders],
  );

  return { orders, orderCount: orders.length, paidRevenue, addOrder };
}

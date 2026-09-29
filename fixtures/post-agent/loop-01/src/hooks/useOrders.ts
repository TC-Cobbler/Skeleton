import { useCallback, useMemo, useState } from "react";

export type OrderStatus = "paid" | "pending" | "refunded";

export type Order = {
  id: string;
  customer: string;
  /** Order total in pence. */
  total: number;
  status: OrderStatus;
};

export type NewOrderInput = {
  customer: string;
  /** Order total in pence. */
  total: number;
};

/**
 * In-memory stand-in for `GET /api/orders`. Replace with a fetch when the
 * backend exists; the `Order` shape is what the API should return.
 */
const MOCK_ORDERS: Order[] = [
  { id: "1001", customer: "Ada Lovelace", total: 4200, status: "paid" },
  { id: "1002", customer: "Alan Turing", total: 12999, status: "pending" },
  { id: "1003", customer: "Grace Hopper", total: 2550, status: "paid" },
  { id: "1004", customer: "Katherine Johnson", total: 8900, status: "refunded" },
  { id: "1005", customer: "Tim Berners-Lee", total: 1575, status: "paid" },
  { id: "1006", customer: "Margaret Hamilton", total: 31000, status: "pending" },
  { id: "1007", customer: "Edsger Dijkstra", total: 649, status: "paid" },
  { id: "1008", customer: "Barbara Liskov", total: 7420, status: "paid" },
];

function nextOrderId(orders: Order[]): string {
  const max = orders.reduce((acc, o) => Math.max(acc, Number(o.id) || 0), 0);
  return String(max + 1);
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);

  const addOrder = useCallback((input: NewOrderInput) => {
    setOrders((prev) => [
      ...prev,
      { id: nextOrderId(prev), customer: input.customer, total: input.total, status: "pending" },
    ]);
  }, []);

  const paidRevenue = useMemo(
    () => orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + o.total, 0),
    [orders],
  );

  return { orders, addOrder, orderCount: orders.length, paidRevenue };
}

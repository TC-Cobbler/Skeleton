import type { Order } from "@/hooks/useOrders";

/** Quotes a CSV field when it contains a comma, quote or newline (RFC 4180). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialises orders as CSV: id, customer, total (pounds, 2dp), status. */
export function ordersToCsv(orders: Order[]): string {
  const header = ["id", "customer", "total", "status"];
  const rows = orders.map((o) => [o.id, o.customer, (o.total / 100).toFixed(2), o.status]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** Triggers a browser download of the given orders as a CSV file. */
export function downloadOrdersCsv(orders: Order[], filename = "orders.csv"): void {
  const blob = new Blob([ordersToCsv(orders)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

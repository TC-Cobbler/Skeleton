import type { Order } from "@/hooks/useOrders";
import { formatPenceAsPounds } from "@/lib/format";

/**
 * Quotes a CSV field when needed (RFC 4180). Fields that a spreadsheet would
 * treat as a formula (leading =, +, -, @, tab, CR) are prefixed with ' so an
 * entered customer name can't run as a formula when the file is opened.
 */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialises orders as CSV: id, customer, total (pounds, e.g. 42.00), status. */
export function ordersToCsv(orders: Order[]): string {
  const header = ["id", "customer", "total", "status"];
  const rows = orders.map((o) => [String(o.id), o.customer, formatPenceAsPounds(o.total), o.status]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** Triggers a browser download of the given orders as `orders.csv`. */
export function downloadOrdersCsv(orders: Order[]): void {
  const blob = new Blob([ordersToCsv(orders)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orders.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

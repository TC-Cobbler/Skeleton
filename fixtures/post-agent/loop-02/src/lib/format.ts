import type { OrderStatus } from "@/hooks/useOrders";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** Formats an integer amount in pence as GBP, e.g. 4200 → "£42.00". */
export function formatGBP(pence: number): string {
  return gbp.format(pence / 100);
}

/**
 * Parses a user-entered pounds amount ("42", "42.5", "£1,042.50") into
 * integer pence. Returns null if the input isn't a valid non-negative amount.
 */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pounds = Number(match[1]);
  const pence = Number((match[2] ?? "").padEnd(2, "0"));
  return pounds * 100 + pence;
}

/** Formats an integer amount in pence as a plain pounds figure, e.g. 4200 → "42.00". */
export function formatPenceAsPounds(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
};

/** Human-readable label for an order status, e.g. "paid" → "Paid". */
export function formatOrderStatus(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** Formats an integer amount in pence as GBP, e.g. 4200 → "£42.00". */
export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

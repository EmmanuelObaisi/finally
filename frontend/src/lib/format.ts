/** Number formatting for the terminal. */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const price = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export const formatUsd = (n: number) => usd.format(n);
export const formatPrice = (n: number | null | undefined) => (n == null ? "--" : price.format(n));
export const formatQty = (n: number) => qty.format(n);

export function formatSigned(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

export const formatPercent = (n: number | null | undefined) => (n == null ? "--" : `${formatSigned(n)}%`);

export function formatSignedUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${usd.format(Math.abs(n))}`;
}

/** Tailwind text color class for a signed value. */
export const tone = (n: number | null | undefined) =>
  n == null || n === 0 ? "text-muted" : n > 0 ? "text-up" : "text-down";

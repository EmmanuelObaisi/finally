// The only place numbers are formatted. change_percent is already in percent units.
export const MISSING = "--";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const signed = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

type Num = number | null | undefined;

function usable(n: Num): n is number {
  return n != null && Number.isFinite(n);
}

export function fmtMoney(n: Num): string {
  return usable(n) ? money.format(n) : MISSING;
}

export function fmtQty(n: Num): string {
  return usable(n) ? quantity.format(n) : MISSING;
}

export function fmtSigned(n: Num): string {
  return usable(n) ? signed.format(n) : MISSING;
}

export function fmtPct(n: Num): string {
  return usable(n) ? signed.format(n) + "%" : MISSING;
}

/** Color class for a formatted signed value; a rounded zero stays neutral. */
export function toneClass(text: string): string {
  if (text === MISSING) return "text-muted";
  if (text.startsWith("+")) return "text-up";
  if (text.startsWith("-")) return "text-down";
  return "text-fg";
}

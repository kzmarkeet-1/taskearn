/**
 * Money helpers.
 *
 * Every amount in TaskEarn is an integer in minor units (paisa).
 * 100 minor units = PKR 1.00. Floats never touch a balance.
 */

export const CURRENCY = "PKR";
export const MINOR_UNITS_PER_UNIT = 100;

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_UNIT);
}

export function toMajor(minor: number): number {
  return minor / MINOR_UNITS_PER_UNIT;
}

export function formatMoney(minor: number, opts: { withCurrency?: boolean } = {}): string {
  const { withCurrency = true } = opts;
  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajor(minor));
  return withCurrency ? `${CURRENCY} ${formatted}` : formatted;
}

export function formatMoneyCompact(minor: number): string {
  const major = toMajor(minor);
  if (Math.abs(major) >= 1_000_000) return `${CURRENCY} ${(major / 1_000_000).toFixed(1)}M`;
  if (Math.abs(major) >= 1_000) return `${CURRENCY} ${(major / 1_000).toFixed(1)}k`;
  return formatMoney(minor);
}

/** Parses user input ("250", "250.50") into minor units. Returns null when invalid. */
export function parseMoneyInput(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return toMinor(Number(trimmed));
}

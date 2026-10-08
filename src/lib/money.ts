export const CURRENCIES = ["MYR", "SGD", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Digits with an optional decimal point and at most 2 decimal places.
// No minus sign, so negative amounts can't be typed or pasted in.
export const MONEY_INPUT_PATTERN = /^\d*\.?\d{0,2}$/;

// Turns money input text into a number; blank or invalid input gives null.
export function parseAmount(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

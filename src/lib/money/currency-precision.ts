/**
 * Currency precision rules based on ISO 4217 minor-unit conventions.
 *
 * Most currencies use 2 decimal places. Some (JPY, KRW, etc.) are zero-decimal.
 * A few (BHD, JOD, KWD, OMR, TND) use 3 decimal places.
 */

import { round } from "./decimal";

export const DEFAULT_DECIMALS = 2;

// Currencies with zero decimal places (no minor units)
const ZERO_DECIMAL_CURRENCIES = new Set([
  "JPY",
  "KRW",
  "VND",
  "CLP",
  "COP",
  "ISK",
]);

// Currencies with three decimal places
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD",
  "JOD",
  "KWD",
  "OMR",
  "TND",
]);

/**
 * Return the number of decimal (minor-unit) places for a given ISO currency code.
 * Falls back to 2 for unknown currencies.
 */
export function getCurrencyDecimals(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return DEFAULT_DECIMALS;
}

/**
 * Round a decimal-string value to the appropriate precision for the given currency,
 * using half-up rounding.
 */
export function roundToCurrency(value: string, currency: string): string {
  const decimals = getCurrencyDecimals(currency);
  return round(value, decimals);
}

/**
 * Shared decimal arithmetic using decimal.js.
 *
 * All monetary values are canonical non-exponent decimal strings.
 * All public functions accept decimal strings and return decimal strings
 * (except `compare`, `allocate`, and `isValidDecimal` which have different
 * return types).
 */

import Decimal from "decimal.js";

// Default rounding mode: half-up (common financial rounding)
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Safely parse a money value. Accepts strings, numbers, or Decimal instances.
 * Throws if the input is not a valid finite decimal.
 */
export function parse(input: string | number | Decimal): Decimal {
  return new Decimal(input);
}

/**
 * Normalize a decimal string to its canonical non-exponent form.
 * For example, "1.2300" -> "1.23" and "1e2" -> "100".
 */
export function normalize(value: string): string {
  return new Decimal(value).toFixed();
}

/**
 * Returns true if the string is a valid finite decimal representable at
 * database precision (max 1000 digits).
 */
export function isValidDecimal(value: string): boolean {
  try {
    const d = new Decimal(value);
    return d.isFinite();
  } catch {
    return false;
  }
}

/**
 * Add two decimal strings.
 */
export function add(a: string, b: string): string {
  return new Decimal(a).plus(b).toFixed();
}

/**
 * Subtract b from a.
 */
export function subtract(a: string, b: string): string {
  return new Decimal(a).minus(b).toFixed();
}

/**
 * Multiply two decimal strings.
 */
export function multiply(a: string, b: string): string {
  return new Decimal(a).times(b).toFixed();
}

/**
 * Divide a by b.
 */
export function divide(a: string, b: string): string {
  return new Decimal(a).dividedBy(b).toFixed();
}

/**
 * Compare two decimal strings. Returns -1 (a < b), 0 (a === b), or 1 (a > b).
 */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const result = new Decimal(a).comparedTo(b);
  if (result < 0) return -1;
  if (result > 0) return 1;
  return 0;
}

/**
 * Round a decimal string to the given number of decimal places using half-up rounding.
 */
export function round(value: string, decimals: number): string {
  return new Decimal(value).toFixed(decimals);
}

/**
 * Deterministic remainder distribution: allocate a decimal amount across
 * ratios so that the sum of the allocated parts equals the source amount exactly.
 *
 * The last part absorbs any rounding remainder.
 *
 * @param value - The source amount as a decimal string.
 * @param ratios - An array of non-negative ratio numbers. Does not need to sum to 1.
 * @returns An array of allocated decimal strings whose sum equals the input value.
 */
export function allocate(value: string, ratios: number[]): string[] {
  if (ratios.length === 0) return [];

  const decimalValue = new Decimal(value);
  const totalRatio = ratios.reduce((sum, r) => sum + r, 0);

  if (totalRatio === 0) {
    // Equal split when all ratios are zero (last absorbs rounding remainder)
    const perPart = decimalValue.dividedBy(ratios.length);
    const results: string[] = [];
    let distributed = new Decimal(0);
    for (let i = 0; i < ratios.length - 1; i++) {
      const rounded = perPart.toFixed(2, Decimal.ROUND_HALF_UP);
      results.push(rounded);
      distributed = distributed.plus(rounded);
    }
    results.push(decimalValue.minus(distributed).toFixed(2, Decimal.ROUND_HALF_UP));
    return results;
  }

  let distributed = new Decimal(0);
  const results: string[] = [];

  for (let i = 0; i < ratios.length - 1; i++) {
    const share = decimalValue.times(ratios[i]!).dividedBy(totalRatio);
    const rounded = share.toFixed(2, Decimal.ROUND_HALF_UP);
    results.push(rounded);
    distributed = distributed.plus(rounded);
  }

  // Last part absorbs rounding remainder
  const remainder = decimalValue.minus(distributed);
  results.push(remainder.toFixed(2, Decimal.ROUND_HALF_UP));

  return results;
}

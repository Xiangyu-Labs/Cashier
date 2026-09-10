import { compare } from "./decimal";
import { roundToCurrency } from "./currency-precision";
import { ValidationError } from "@/lib/errors";

export function assertExpenseAmountDirection(
  previous: string,
  next: string,
  currency: string
): void {
  const rounded = roundToCurrency(next, currency);
  if (compare(rounded, "0") === 0 || compare(previous, "0") < 0 !== compare(rounded, "0") < 0) {
    throw new ValidationError("Amount must preserve the expense or deduction direction");
  }
}

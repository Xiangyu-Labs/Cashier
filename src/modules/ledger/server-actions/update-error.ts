import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { UpdateLedgerActionErrorCode } from "@/modules/ledger/contracts";

export function toUpdateLedgerActionErrorCode(error: unknown): UpdateLedgerActionErrorCode {
  if (error instanceof AppError) {
    if (error.code === "EXCHANGE_RATES_UNAVAILABLE") return "rates_unavailable";
    if (error.code === "CURRENCY_NOT_FOUND") return "unsupported_currency";
  }
  if (error instanceof ValidationError) return "validation_failed";
  if (error instanceof ConflictError || error instanceof NotFoundError) return "conflict";
  return "unexpected";
}

/**
 * When an EXCHANGE_RATES_UNAVAILABLE error carries the specific dates that
 * couldn't be resolved (see ensureExchangeRatesForCurrencyChange), surface
 * them so the client can tell the user which days are actually missing
 * instead of a generic "some dates are missing" message.
 */
export function extractUpdateLedgerActionDates(error: unknown): string[] | undefined {
  if (!(error instanceof AppError)) return undefined;
  const dates = error.details?.dates;
  return Array.isArray(dates) && dates.every((date) => typeof date === "string")
    ? dates
    : undefined;
}

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

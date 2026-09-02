import { desc, eq } from "drizzle-orm";
import type { CurrencyPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/errors";
import { isValidDecimal } from "@/lib/money/decimal";
import { currencyRates } from "@/persistence";
import { lockLedgerForUpdate } from "../transaction-locks";
import { convertWithRates } from "@/modules/currency/application/services/rate-calculation";
import { roundToCurrency } from "@/lib/money/currency-precision";

import { recalculateCurrentEntries } from "./shared";

export const postgresCurrencyAdapter: CurrencyPort = {
  async convert(amount, from, to, date) {
    if (!isValidDecimal(amount)) throw new ValidationError("Amount must be numeric");
    if (from === to) return roundToCurrency(amount, to);
    const [rateRow] = await db
      .select()
      .from(currencyRates)
      .where(date == null ? undefined : eq(currencyRates.date, date.split("T")[0] ?? date))
      .orderBy(desc(currencyRates.date))
      .limit(1);
    if (rateRow == null) throw new ConflictError("No stored currency rates are available");
    return convertWithRates(
      amount,
      { base: rateRow.base, date: rateRow.date, rates: rateRow.rates },
      from,
      to
    ).convertedAmount;
  },
  async recalculateLedger(ledgerId, mainCurrency) {
    return db.transaction(async (tx) => {
      // Lock the ledger to serialise with concurrent settings changes.
      await lockLedgerForUpdate(tx, ledgerId);
      return recalculateCurrentEntries(tx, ledgerId, mainCurrency);
    });
  },
  async recalculateLedgerForDate(ledgerId, date) {
    const targetDate = date.split("T")[0] ?? date;
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, ledgerId);
      // Entries dated on the event use that date's rates; undated entries use
      // the latest stored rate, so both must be refreshed.
      return recalculateCurrentEntries(tx, ledgerId, ledger.mainCurrency, targetDate, true);
    });
  },
};

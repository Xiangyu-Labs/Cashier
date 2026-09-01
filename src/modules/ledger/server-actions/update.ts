"use server";
import { withAuth } from "@/lib/auth-actions";
import { logError } from "@/lib/error-handlers";
import type { UpdateLedgerActionResult } from "@/modules/ledger/contracts";
import {
  parseLedgerId,
  parseUpdateLedgerInput,
  type UpdateLedgerInput,
} from "@/modules/ledger/contract-schemas";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { extractUpdateLedgerActionDates, toUpdateLedgerActionErrorCode } from "./update-error";
import { serverComposition } from "@/application/server-composition-root";

export const updateLedgerSettingsAction = withAuth(
  async (
    userId: string,
    id: string,
    data: UpdateLedgerInput
  ): Promise<UpdateLedgerActionResult> => {
    try {
      const validated = parseUpdateLedgerInput(data);
      return {
        ok: true,
        ledger: await updateLedger(
          userId,
          parseLedgerId(id),
          validated,
          serverComposition.settings,
          serverComposition.exchangeRates
        ),
      };
    } catch (error) {
      const code = toUpdateLedgerActionErrorCode(error);
      // This settings action intentionally returns a recovery-code result so
      // callers can keep drafts on known conflicts. Other simple commands
      // continue to throw their typed application errors at the boundary.
      if (code === "unexpected") logError("updateLedgerSettingsAction", error);
      const dates =
        code === "rates_unavailable" ? extractUpdateLedgerActionDates(error) : undefined;
      return { ok: false, code, ...(dates !== undefined ? { dates } : {}) };
    }
  }
);

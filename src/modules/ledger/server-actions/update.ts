"use server";
import { withAuth } from "@/lib/auth-actions";
import { logError } from "@/lib/error-handlers";
import type { UpdateLedgerActionResult } from "@/modules/ledger/contracts";
import { parseUpdateLedgerInput, type UpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { toUpdateLedgerActionErrorCode } from "./update-error";

export const updateLedgerAction = withAuth(
  async (
    userId: string,
    id: string,
    data: UpdateLedgerInput
  ): Promise<UpdateLedgerActionResult> => {
    try {
      const validated = parseUpdateLedgerInput(data);
      return { ok: true, ledger: await updateLedger(userId, id, validated) };
    } catch (error) {
      const code = toUpdateLedgerActionErrorCode(error);
      if (code === "unexpected") logError("updateLedgerAction", error);
      return { ok: false, code };
    }
  }
);

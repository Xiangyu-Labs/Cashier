"use server";
import { withAuth } from "@/lib/auth-actions";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { parseUpdateLedgerInput, type UpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";

export const updateLedgerAction = withAuth(
  async (userId: string, id: string, data: UpdateLedgerInput): Promise<LedgerDto> => {
    const validated = parseUpdateLedgerInput(data);
    return updateLedger(userId, id, validated);
  }
);

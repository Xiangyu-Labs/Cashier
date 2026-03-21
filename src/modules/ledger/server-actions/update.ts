"use server";
import { withAuth } from "@/lib/auth-actions";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { updateLedgerInputSchema, type UpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import { updateLedger } from "@/modules/ledger/use-cases";

export const updateLedgerAction = withAuth(
  async (userId: string, id: string, data: UpdateLedgerInput): Promise<LedgerDto> => {
    const validated = updateLedgerInputSchema.parse(data);
    return updateLedger(userId, id, validated);
  }
);

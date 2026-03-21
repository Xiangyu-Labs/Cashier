"use server";
import { withAuth } from "@/lib/auth-actions";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { createLedgerInputSchema, type CreateLedgerInput } from "@/modules/ledger/contract-schemas";
import { createLedger } from "@/modules/ledger/use-cases";

export const createLedgerAction = withAuth(
  async (userId: string, data: CreateLedgerInput): Promise<LedgerDto> => {
    const validated = createLedgerInputSchema.parse(data);
    const payload: Parameters<typeof createLedger>[0] = { userId };
    if (validated.aiLanguage !== undefined) {
      payload.locale = validated.aiLanguage;
    }
    return createLedger(payload);
  }
);

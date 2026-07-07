"use server";
import { withAuth } from "@/lib/auth-actions";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { parseCreateLedgerInput, type CreateLedgerInput } from "@/modules/ledger/contract-schemas";
import { createLedger } from "@/modules/ledger/application/use-cases/create-ledger";

export const createLedgerAction = withAuth(
  async (userId: string, data: CreateLedgerInput): Promise<LedgerDto> => {
    const validated = parseCreateLedgerInput(data);
    const payload: Parameters<typeof createLedger>[0] = { userId };
    if (validated.aiLanguage !== undefined) {
      payload.locale = validated.aiLanguage;
    }
    return createLedger(payload);
  }
);

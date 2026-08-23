"use server";
import { withAuth } from "@/lib/auth-actions";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { parseCreateLedgerInput, type CreateLedgerInput } from "@/modules/ledger/contract-schemas";
import { createLedger } from "@/modules/ledger/application/use-cases/create-ledger";
import { serverComposition } from "@/application/server-composition-root";
import { getLocale } from "next-intl/server";

export const createLedgerAction = withAuth(
  async (userId: string, data: CreateLedgerInput): Promise<LedgerDto> => {
    const validated = parseCreateLedgerInput(data);
    void validated;
    const payload: Parameters<typeof createLedger>[0] = { userId, locale: await getLocale() };
    return createLedger(payload, serverComposition.ledgers);
  }
);

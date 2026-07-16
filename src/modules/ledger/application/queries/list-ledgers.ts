import { currentApplication } from "@/application/current";
import type { LedgerDto } from "@/modules/ledger/contracts";

export async function getLedgers(userId: string): Promise<LedgerDto[]> {
  return (await currentApplication.ledgers.listForUser(userId)).map((ledger) => ({
    id: ledger.id,
    userId: ledger.userId,
    metadata: { settings: ledger.settings },
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt,
    deletedAt: null,
  }));
}

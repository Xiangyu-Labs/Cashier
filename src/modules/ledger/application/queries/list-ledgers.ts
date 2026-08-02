import type { LedgerPort } from "@/application/contracts";
import type { LedgerDto } from "@/modules/ledger/contracts";

export async function getLedgers(userId: string, ledgers: LedgerPort): Promise<LedgerDto[]> {
  return (await ledgers.listForUser(userId)).map((ledger) => ({
    id: ledger.id,
    userId: ledger.userId,
    settings: ledger.settings,
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt,
    deletedAt: null,
  }));
}

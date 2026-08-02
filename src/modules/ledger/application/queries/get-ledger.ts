import { currentApplication } from "@/application/current";
import type { LedgerDto } from "@/modules/ledger/contracts";

export async function getLedger(input: {
  ledgerId: string;
  userId: string;
}): Promise<LedgerDto | null> {
  const ledger = await currentApplication.ledgers.getOwned(input.ledgerId, input.userId);
  return ledger == null
    ? null
    : {
        id: ledger.id,
        userId: ledger.userId,
        settings: ledger.settings,
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
      };
}

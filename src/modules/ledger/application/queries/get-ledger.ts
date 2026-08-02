import type { LedgerPort } from "@/application/contracts";
import type { LedgerDto } from "@/modules/ledger/contracts";

export async function getLedger(
  input: { ledgerId: string; userId: string },
  ledgers: LedgerPort
): Promise<LedgerDto | null> {
  const ledger = await ledgers.getOwned(input.ledgerId, input.userId);
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

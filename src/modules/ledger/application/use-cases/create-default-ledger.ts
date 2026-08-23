import type { LedgerPort } from "@/application/contracts";
import { getDefaultLedger } from "@/config/default-ledger";

export async function createDefaultLedger(
  input: { userId: string; locale?: string },
  ledgers: Pick<LedgerPort, "createDefault">
) {
  const defaults = getDefaultLedger(input.locale ?? "zh");
  const ledger = await ledgers.createDefault({
    userId: input.userId,
    settings: defaults.settings,
    categories: defaults.categories,
  });
  return {
    id: ledger.id,
    userId: ledger.userId,
    settings: ledger.settings,
    createdAt: new Date(ledger.createdAt),
    updatedAt: new Date(ledger.updatedAt),
    deletedAt: null,
  };
}

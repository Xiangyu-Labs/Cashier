import type { LedgerPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";

export async function deleteLedger(
  userId: string,
  ledgerId: string,
  ledgers: LedgerPort
): Promise<void> {
  const result = await ledgers.deleteOwned(ledgerId, userId);
  if (result === "forbidden" || result === "not_found") throw new NotFoundError("Ledger");
}

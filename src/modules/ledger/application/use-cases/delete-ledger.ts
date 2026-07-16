import { currentApplication } from "@/application/current";
import type { LedgerPort } from "@/application/contracts";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export async function deleteLedger(
  userId: string,
  ledgerId: string,
  ledgers: LedgerPort = currentApplication.ledgers
): Promise<void> {
  const result = await ledgers.deleteOwned(ledgerId, userId);
  if (result === "forbidden") throw new ForbiddenError("Access denied to this ledger");
  if (result === "not_found") throw new NotFoundError("Ledger");
}

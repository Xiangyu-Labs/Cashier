import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import type { LedgerPort } from "@/application/contracts";

export async function handleAuthUserCreated(
  params: { userId?: string | null },
  ledgers: LedgerPort
): Promise<void> {
  if (params.userId == null || params.userId === "") {
    return;
  }

  await ensureUserLedger({ userId: params.userId }, ledgers);
}

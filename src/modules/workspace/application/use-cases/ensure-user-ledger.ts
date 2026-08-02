import type { LedgerPort } from "@/application/contracts";
import { getDefaultLedger } from "@/config/default-ledger";
import { ConflictError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface EnsureUserLedgerInput {
  userId: string;
  locale?: string;
}
export interface EnsureUserLedgerResult {
  ledgerId: string;
  created: boolean;
}

export async function resolveSingleLedgerForUser(
  input: EnsureUserLedgerInput,
  ledgers: LedgerPort
): Promise<EnsureUserLedgerResult> {
  return ensureUserLedger(input, ledgers);
}

export async function ensureUserLedger(
  input: EnsureUserLedgerInput,
  ledgers: LedgerPort
): Promise<EnsureUserLedgerResult> {
  const existing = await ledgers.listIdsForUser(input.userId);
  if (existing.length > 1) {
    logger.error({ userId: input.userId, ledgerIds: existing }, "Expected one active ledger");
  }
  if (existing[0] != null) return { ledgerId: existing[0], created: false };
  const defaults = getDefaultLedger(input.locale ?? "zh");
  try {
    const ledger = await ledgers.createDefault({
      userId: input.userId,
      settings: defaults.settings,
      categories: defaults.categories,
    });
    return { ledgerId: ledger.id, created: true };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const concurrent = await ledgers.listIdsForUser(input.userId);
    if (concurrent[0] == null) throw error;
    return { ledgerId: concurrent[0], created: false };
  }
}

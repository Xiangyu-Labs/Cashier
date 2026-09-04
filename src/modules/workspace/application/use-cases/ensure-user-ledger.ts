import type { LedgerPort, LedgerContract } from "@/application/contracts";
import { getDefaultLedger } from "@/config/default-ledger";
import { ConflictError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";

export interface EnsureUserLedgerInput {
  userId: string;
  locale?: string;
}
export interface EnsureUserLedgerResult {
  ledger: LedgerContract;
  created: boolean;
}

export async function resolveSingleLedgerForUser(
  input: EnsureUserLedgerInput,
  ledgers: Pick<LedgerPort, "listForUser" | "createDefault">
): Promise<EnsureUserLedgerResult> {
  return ensureUserLedger(input, ledgers);
}

export async function ensureUserLedger(
  input: EnsureUserLedgerInput,
  ledgers: Pick<LedgerPort, "listForUser" | "createDefault">
): Promise<EnsureUserLedgerResult> {
  const existing = await ledgers.listForUser(input.userId);
  if (existing.length > 1) {
    logger.error(
      {
        userSubject: logIdentifier("user", input.userId),
        ledgerSubjects: existing.map((ledger) => logIdentifier("ledger", ledger.id)),
      },
      "Expected one active ledger"
    );
  }
  if (existing[0] != null) return { ledger: existing[0], created: false };
  const defaults = getDefaultLedger(input.locale ?? "zh");
  try {
    const ledger = await ledgers.createDefault({
      userId: input.userId,
      settings: defaults.settings,
      categories: defaults.categories,
    });
    return { ledger, created: true };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const concurrent = await ledgers.listForUser(input.userId);
    if (concurrent[0] == null) throw error;
    return { ledger: concurrent[0], created: false };
  }
}

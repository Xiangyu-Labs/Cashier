import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ledgers } from "@/persistence";
import { createDefaultLedger } from "@/modules/ledger/use-cases";

export interface EnsureUserLedgerInput {
  userId: string;
  locale?: string;
}

export interface EnsureUserLedgerResult {
  ledgerId: string;
  created: boolean;
}

async function listActiveLedgers(userId: string) {
  return db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    orderBy: [desc(ledgers.createdAt)],
    columns: { id: true },
  });
}

export async function ensureUserLedger(
  input: EnsureUserLedgerInput
): Promise<EnsureUserLedgerResult> {
  const existingLedgers = await listActiveLedgers(input.userId);

  if (existingLedgers.length > 1) {
    logger.error(
      {
        userId: input.userId,
        ledgerIds: existingLedgers.map((ledger) => ledger.id),
      },
      "Expected at most one active ledger for user"
    );
  }

  if (existingLedgers.length > 0) {
    return {
      ledgerId: existingLedgers[0].id,
      created: false,
    };
  }

  try {
    const createdLedger = await createDefaultLedger({
      userId: input.userId,
      locale: input.locale,
    });

    return {
      ledgerId: createdLedger.id,
      created: true,
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("UNIQUE constraint failed")) {
      throw error;
    }

    const concurrentLedgers = await listActiveLedgers(input.userId);
    const concurrentLedger = concurrentLedgers[0];

    if (concurrentLedger == null) {
      throw error;
    }

    logger.warn(
      { userId: input.userId, ledgerId: concurrentLedger.id },
      "Recovered from concurrent single-ledger initialization"
    );

    return {
      ledgerId: concurrentLedger.id,
      created: false,
    };
  }
}

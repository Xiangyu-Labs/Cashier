import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgers, processingOutbox, sourceDocuments } from "@/persistence";
import { NotFoundError } from "@/lib/errors";
import type { ProcessingLeaseContract } from "@/application/contracts";

/** Drizzle transaction client type used by all Postgres adapters. */
export type PostgresTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lock order convention:
 *   ledger → source document
 *
 * When a transaction must lock both rows, always lock the ledger row first to prevent deadlocks.
 * Use these helpers inside existing Drizzle transactions — they issue `SELECT ... FOR UPDATE`
 * which holds the row lock until the enclosing transaction commits or rolls back.
 */

/**
 * Acquire a FOR UPDATE row lock on the target ledger row.
 * Returns the locked row so callers can read metadata without an extra round-trip.
 * Throws {@link NotFoundError} when the ledger does not exist or is soft-deleted.
 */
export async function lockLedgerForUpdate(
  tx: PostgresTransaction,
  ledgerId: string
): Promise<typeof ledgers.$inferSelect> {
  const rows = await tx
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)))
    .for("update");

  if (rows.length === 0) {
    throw new NotFoundError("Ledger");
  }

  return rows[0]!;
}

/**
 * Acquire a FOR UPDATE row lock on the target source document row.
 * Returns the locked row so callers can re-read pointers without an extra round-trip.
 * Throws {@link NotFoundError} when the document does not exist or is soft-deleted.
 */
export async function lockSourceDocumentForUpdate(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string
): Promise<typeof sourceDocuments.$inferSelect> {
  const rows = await tx
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .for("update");

  if (rows.length === 0) {
    throw new NotFoundError("Source document");
  }

  return rows[0]!;
}

/**
 * Verify that the caller still holds the processing lease inside the current
 * transaction. Takes a `FOR UPDATE` lock on the outbox row so a concurrent
 * reclaim cannot interleave between this check and the transaction commit.
 *
 * Returns true when no lease is supplied (unleased callers keep the existing
 * behavior) or when the outbox row is still claimed by the supplied token and
 * has not expired.
 */
export async function assertProcessingLeaseHeld(
  tx: PostgresTransaction,
  lease: ProcessingLeaseContract | null | undefined
): Promise<boolean> {
  if (lease == null) return true;
  const rows = await tx
    .select({ id: processingOutbox.id })
    .from(processingOutbox)
    .where(
      and(
        eq(processingOutbox.id, lease.intentId),
        eq(processingOutbox.status, "claimed"),
        eq(processingOutbox.claimToken, lease.claimToken),
        sql`${processingOutbox.claimExpiresAt} > now()`
      )
    )
    .for("update");
  return rows.length > 0;
}

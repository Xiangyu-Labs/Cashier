import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  currencyRates,
  exchangeRateRecalculationJobs,
  ledgerEntries,
  ledgers,
  sourceDocuments,
} from "@/persistence";

export interface ClaimedExchangeRateRecalculation {
  rateDate: string;
  ledgerId: string;
  claimToken: string;
  attempts: number;
}

const MAX_EXCHANGE_RATE_RECALCULATION_ATTEMPTS = 8;
const DEFAULT_EXCHANGE_RATE_CLAIM_LIMIT = 25;
const DEFAULT_EXCHANGE_RATE_CLAIM_LEASE_MS = 300_000;

/** Repair jobs missed by deployments predating the atomic rate/job insert. */
export async function enqueueMissingExchangeRateRecalculations(limit = 1000): Promise<number> {
  const result = await db.execute<{ inserted: number }>(sql`
    WITH candidates AS (
      SELECT rates.date::text AS rate_date, ${ledgers.id} AS ledger_id
      FROM ${currencyRates} AS rates
      INNER JOIN ${sourceDocuments}
        ON (${sourceDocuments.entryDate} = rates.date OR ${sourceDocuments.entryDate} IS NULL)
        AND ${sourceDocuments.deletedAt} IS NULL
      INNER JOIN ${ledgers}
        ON ${ledgers.id} = ${sourceDocuments.ledgerId}
        AND ${ledgers.deletedAt} IS NULL
      INNER JOIN ${ledgerEntries}
        ON ${ledgerEntries.ledgerId} = ${ledgers.id}
        AND ${ledgerEntries.sourceDocumentId} = ${sourceDocuments.id}
        AND ${ledgerEntries.deletedAt} IS NULL
        AND (
          ${sourceDocuments.activeRevisionId} = ${ledgerEntries.sourceDocumentRevisionId}
          OR ${sourceDocuments.pendingRevisionId} = ${ledgerEntries.sourceDocumentRevisionId}
        )
      LEFT JOIN ${exchangeRateRecalculationJobs} AS jobs
        ON jobs.rate_date = rates.date::text AND jobs.ledger_id = ${ledgers.id}
      WHERE jobs.rate_date IS NULL
      GROUP BY rates.date, ${ledgers.id}
      ORDER BY rates.date, ${ledgers.id}
      LIMIT ${limit}
    ), inserted AS (
      INSERT INTO ${exchangeRateRecalculationJobs} (rate_date, ledger_id)
      SELECT rate_date, ledger_id FROM candidates
      ON CONFLICT (rate_date, ledger_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::int AS inserted FROM inserted
  `);
  return result.rows[0]?.inserted ?? 0;
}

/**
 * Claim up to `limit` due jobs inside a transaction using FOR UPDATE SKIP
 * LOCKED. Expired `claimed` jobs become claimable again, which lets a
 * crashed or slow worker's lease be taken over by the next run.
 */
export async function claimExchangeRateRecalculations(input: {
  now: Date;
  limit?: number;
  leaseMs?: number;
}): Promise<readonly ClaimedExchangeRateRecalculation[]> {
  const limit = input.limit ?? DEFAULT_EXCHANGE_RATE_CLAIM_LIMIT;
  const leaseMs = input.leaseMs ?? DEFAULT_EXCHANGE_RATE_CLAIM_LEASE_MS;
  const claimToken = crypto.randomUUID();
  const claimExpiresAt = new Date(input.now.getTime() + leaseMs);

  return db.transaction(async (tx) => {
    const result = await tx.execute<{
      rate_date: string;
      ledger_id: string;
      claim_token: string;
      attempts: number;
    }>(sql`
      WITH candidates AS (
        SELECT rate_date, ledger_id
        FROM ${exchangeRateRecalculationJobs}
        WHERE ${exchangeRateRecalculationJobs.nextAttemptAt} <= ${input.now}
          AND (
            ${exchangeRateRecalculationJobs.status} = 'pending'
            OR (
              ${exchangeRateRecalculationJobs.status} = 'claimed'
              AND ${exchangeRateRecalculationJobs.claimExpiresAt} < ${input.now}
            )
          )
        ORDER BY ${exchangeRateRecalculationJobs.nextAttemptAt}, ${exchangeRateRecalculationJobs.createdAt}
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${exchangeRateRecalculationJobs} AS jobs
      SET
        status = 'claimed',
        claim_token = ${claimToken},
        claim_expires_at = ${claimExpiresAt},
        updated_at = now()
      FROM candidates
      WHERE jobs.rate_date = candidates.rate_date AND jobs.ledger_id = candidates.ledger_id
      RETURNING jobs.rate_date, jobs.ledger_id, jobs.claim_token, jobs.attempts
    `);

    return result.rows.map((row) => ({
      rateDate: row.rate_date,
      ledgerId: row.ledger_id,
      claimToken: row.claim_token,
      attempts: row.attempts,
    }));
  });
}

/**
 * Delete a successfully processed job. Requires the claim token so a worker
 * whose lease was taken over can never delete another worker's job.
 */
export async function completeExchangeRateRecalculation(input: {
  rateDate: string;
  ledgerId: string;
  claimToken: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(exchangeRateRecalculationJobs)
    .where(
      and(
        eq(exchangeRateRecalculationJobs.rateDate, input.rateDate),
        eq(exchangeRateRecalculationJobs.ledgerId, input.ledgerId),
        eq(exchangeRateRecalculationJobs.claimToken, input.claimToken)
      )
    )
    .returning({ rateDate: exchangeRateRecalculationJobs.rateDate });
  return deleted.length === 1;
}

/**
 * Record a failed attempt with exponential backoff capped at one hour.
 * After MAX_EXCHANGE_RATE_RECALCULATION_ATTEMPTS failures the job becomes
 * permanently failed. Returns whether another retry is scheduled.
 */
export async function failExchangeRateRecalculation(input: {
  rateDate: string;
  ledgerId: string;
  claimToken: string;
  now: Date;
  errorCode: string;
}): Promise<"retry_scheduled" | "permanently_failed"> {
  const updated = await db
    .update(exchangeRateRecalculationJobs)
    .set({
      attempts: sql`${exchangeRateRecalculationJobs.attempts} + 1`,
      status: sql`CASE
        WHEN ${exchangeRateRecalculationJobs.attempts} + 1 >= ${MAX_EXCHANGE_RATE_RECALCULATION_ATTEMPTS}
        THEN 'failed'::exchange_rate_recalculation_status
        ELSE 'pending'::exchange_rate_recalculation_status
      END`,
      nextAttemptAt: sql`(${input.now})::timestamptz + least(
        interval '1 hour',
        interval '5 seconds' * power(2, ${exchangeRateRecalculationJobs.attempts} + 1)
      )`,
      lastError: input.errorCode,
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(exchangeRateRecalculationJobs.rateDate, input.rateDate),
        eq(exchangeRateRecalculationJobs.ledgerId, input.ledgerId),
        eq(exchangeRateRecalculationJobs.claimToken, input.claimToken)
      )
    )
    .returning({ status: exchangeRateRecalculationJobs.status });

  if (updated.length !== 1) {
    // The claim was lost (lease taken over); the job is still tracked.
    return "retry_scheduled";
  }
  return updated[0]!.status === "failed" ? "permanently_failed" : "retry_scheduled";
}

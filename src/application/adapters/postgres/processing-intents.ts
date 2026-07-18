import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type {
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingPort,
  RecoverableProcessingIntentContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import {
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export interface PostgresProcessingIntentAdapterOptions {
  leaseMs?: number;
  now?: () => Date;
  onDispatch?: () => void;
}

function mapIntent(row: typeof processingOutbox.$inferSelect): ProcessingIntentContract {
  const payload = row.payload as { sourceDocumentId?: unknown; requestedAt?: unknown } | null;
  if (typeof payload?.sourceDocumentId !== "string") {
    throw new Error(`Processing intent ${row.id} has no source document identity`);
  }
  return {
    id: row.id,
    sourceDocumentId: payload.sourceDocumentId,
    revisionId: row.revisionId,
    requestedAt:
      typeof payload.requestedAt === "string" ? payload.requestedAt : row.createdAt.toISOString(),
    attempt: row.attemptNumber,
  };
}

export class PostgresProcessingIntentAdapter implements ProcessingPort {
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly onDispatch: (() => void) | undefined;

  constructor(options: PostgresProcessingIntentAdapterOptions = {}) {
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.now = options.now ?? (() => new Date());
    this.onDispatch = options.onDispatch;
  }

  async dispatch(intent: ProcessingIntentContract): Promise<void> {
    await db.transaction(async (tx) => {
      const revision = await tx
        .select({
          ledgerId: sourceDocumentRevisions.ledgerId,
          sourceDocumentId: sourceDocumentRevisions.sourceDocumentId,
          outcome: sourceDocumentRevisions.outcome,
        })
        .from(sourceDocumentRevisions)
        .innerJoin(
          sourceDocuments,
          and(
            eq(sourceDocuments.ledgerId, sourceDocumentRevisions.ledgerId),
            eq(sourceDocuments.id, sourceDocumentRevisions.sourceDocumentId)
          )
        )
        .where(
          and(
            eq(sourceDocumentRevisions.id, intent.revisionId),
            eq(sourceDocumentRevisions.sourceDocumentId, intent.sourceDocumentId),
            eq(sourceDocuments.pendingRevisionId, intent.revisionId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .then((rows) => rows[0]);
      if (revision == null || !["queued", "processing"].includes(revision.outcome)) return;

      await tx.insert(processingAttempts)
        .values({
          ledgerId: revision.ledgerId,
          revisionId: intent.revisionId,
          attemptNumber: intent.attempt,
          status: "queued",
        })
        .onConflictDoNothing()
        ;
      await tx.insert(processingOutbox)
        .values({
          id: intent.id,
          ledgerId: revision.ledgerId,
          revisionId: intent.revisionId,
          attemptNumber: intent.attempt,
          idempotencyKey: intent.id,
          status: "pending",
          payload: {
            sourceDocumentId: intent.sourceDocumentId,
            requestedAt: intent.requestedAt,
          },
          availableAt: new Date(intent.requestedAt),
        })
        .onConflictDoNothing()
        ;
    });
    this.onDispatch?.();
  }

  async claim(intentId: string): Promise<ProcessingClaimContract | null> {
    return this.claimWhere(eq(processingOutbox.id, intentId));
  }

  async claimNext(): Promise<ProcessingClaimContract | null> {
    const now = this.now();
    const candidate = await db
      .select({ id: processingOutbox.id })
      .from(processingOutbox)
      .where(
        and(
          lte(processingOutbox.availableAt, now),
          or(
            eq(processingOutbox.status, "pending"),
            and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
          )
        )
      )
      .orderBy(asc(processingOutbox.availableAt), asc(processingOutbox.createdAt))
      .limit(1)
      .then((rows) => rows[0]);
    return candidate == null ? null : this.claim(candidate.id);
  }

  private async claimWhere(
    identity: ReturnType<typeof eq>
  ): Promise<ProcessingClaimContract | null> {
    const now = this.now();
    const claimToken = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return db.transaction(async (tx) => {
      const row = await tx
        .update(processingOutbox)
        .set({
          status: "claimed",
          claimToken,
          claimedAt: now,
          claimExpiresAt: expiresAt,
        })
        .where(
          and(
            identity,
            lte(processingOutbox.availableAt, now),
            or(
              eq(processingOutbox.status, "pending"),
              and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
            )
          )
        )
        .returning()
        .then((rows) => rows[0]);
      if (row == null) return null;
      const intent = mapIntent(row);
      await tx.update(processingAttempts)
        .set({ status: "processing", startedAt: now })
        .where(
          and(
            eq(processingAttempts.revisionId, row.revisionId),
            eq(processingAttempts.attemptNumber, row.attemptNumber),
            eq(processingAttempts.status, "queued")
          )
        )
        ;
      await tx.update(sourceDocumentRevisions)
        .set({ outcome: "processing" })
        .where(
          and(
            eq(sourceDocumentRevisions.id, row.revisionId),
            eq(sourceDocumentRevisions.outcome, "queued")
          )
        )
        ;
      return { intent, claimToken, expiresAt: expiresAt.toISOString() };
    });
  }

  async complete(result: ProcessingCompletionContract): Promise<boolean> {
    const now = this.now();
    return db.transaction(async (tx) => {
      const row = await tx
        .update(processingOutbox)
        .set({
          status: result.outcome === "failed" ? "failed" : "completed",
          completedAt: now,
          claimToken: null,
          claimExpiresAt: null,
        })
        .where(
          and(
            eq(processingOutbox.id, result.intentId),
            eq(processingOutbox.status, "claimed"),
            eq(processingOutbox.claimToken, result.claimToken)
          )
        )
        .returning({
          revisionId: processingOutbox.revisionId,
          attemptNumber: processingOutbox.attemptNumber,
        })
        .then((rows) => rows[0]);
      if (row == null) return false;
      await tx.update(processingAttempts)
        .set({
          status: result.outcome,
          completedAt: now,
          retryClassification:
            result.outcome === "anomaly"
              ? "anomaly"
              : result.outcome === "failed"
                ? "retryable"
                : null,
          diagnosticCode: result.diagnostic?.code ?? null,
          correlationId: result.diagnostic?.correlationId ?? null,
        })
        .where(
          and(
            eq(processingAttempts.revisionId, row.revisionId),
            eq(processingAttempts.attemptNumber, row.attemptNumber)
          )
        )
        ;
      return true;
    });
  }

  /**
   * Atomically increments schedule_attempt_count, sets last_scheduled_at,
   * and advances next_available_at for the given outbox row.
   * Returns true if the row existed and was updated, false otherwise.
   */
  async scheduleRecovery(
    revisionId: string,
    intentId: string,
    ledgerId: string,
    cooldownSeconds: number
  ): Promise<boolean> {
    const now = this.now();
    const nextAvailable = new Date(now.getTime() + cooldownSeconds * 1000);
    const result = await db
      .update(processingOutbox)
      .set({
        scheduleAttemptCount: sql`${processingOutbox.scheduleAttemptCount} + 1`,
        lastScheduledAt: now,
        nextAvailableAt: nextAvailable,
      })
      .where(
        and(
          eq(processingOutbox.id, intentId),
          eq(processingOutbox.ledgerId, ledgerId),
          eq(processingOutbox.revisionId, revisionId),
          lte(processingOutbox.nextAvailableAt, now),
          or(
            eq(processingOutbox.status, "pending"),
            and(
              eq(processingOutbox.status, "claimed"),
              lte(processingOutbox.claimExpiresAt, now)
            )
          )
        )
      )
      .returning({ id: processingOutbox.id })
      .then((rows) => rows[0]);
    return result != null;
  }

  /**
   * Selects recoverable processing intents for the given ledger.
   * Returns intents that are pending or have an expired claim,
   * whose next_available_at <= NOW, whose schedule_attempt_count
   * is below maxCount, and whose revision is still the current
   * pending revision for the source document.
   * Ordered by next_available_at ASC, limited by `limit`.
   */
  async selectRecoverable(
    ledgerId: string,
    maxCount: number,
    limit: number
  ): Promise<readonly RecoverableProcessingIntentContract[]> {
    const now = this.now();
    const rows = await db
      .select({
        id: processingOutbox.id,
        sourceDocumentId: sql<string>`${processingOutbox.payload}->>'sourceDocumentId'`,
        revisionId: processingOutbox.revisionId,
        requestedAt: sql<string>`COALESCE(${processingOutbox.payload}->>'requestedAt', ${processingOutbox.createdAt}::text)`,
        attempt: processingOutbox.attemptNumber,
        scheduleAttemptCount: processingOutbox.scheduleAttemptCount,
        nextAvailableAt: processingOutbox.nextAvailableAt,
      })
      .from(processingOutbox)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocuments.id, sql`CAST(${processingOutbox.payload}->>'sourceDocumentId' AS text)`),
          eq(sourceDocuments.pendingRevisionId, processingOutbox.revisionId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .where(
        and(
          eq(processingOutbox.ledgerId, ledgerId),
          lte(processingOutbox.scheduleAttemptCount, maxCount - 1),
          lte(processingOutbox.nextAvailableAt, now),
          or(
            eq(processingOutbox.status, "pending"),
            and(
              eq(processingOutbox.status, "claimed"),
              lte(processingOutbox.claimExpiresAt, now)
            )
          )
        )
      )
      .orderBy(asc(processingOutbox.nextAvailableAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      sourceDocumentId: row.sourceDocumentId,
      revisionId: row.revisionId,
      requestedAt: row.requestedAt,
      attempt: row.attempt,
      scheduleAttemptCount: row.scheduleAttemptCount,
      nextAvailableAt: row.nextAvailableAt.toISOString(),
    }));
  }

  /**
   * Marks an outbox intent as exhausted (failed with request_bound_retry_exhausted).
   * Only applies if the revision is still the current pending revision for the source document.
   */
  async markExhausted(intentId: string): Promise<boolean> {
    const now = this.now();
    return db.transaction(async (tx) => {
      const row = await tx
        .select({
          revisionId: processingOutbox.revisionId,
          ledgerId: processingOutbox.ledgerId,
          payloadSourceDocumentId: sql<string>`${processingOutbox.payload}->>'sourceDocumentId'`,
          attemptNumber: processingOutbox.attemptNumber,
        })
        .from(processingOutbox)
        .where(eq(processingOutbox.id, intentId))
        .then((rows) => rows[0]);
      if (row == null) return false;

      const updated = await tx
        .update(processingOutbox)
        .set({
          status: "failed",
          completedAt: now,
        })
        .where(
          and(
            eq(processingOutbox.id, intentId),
            eq(processingOutbox.status, "pending")
          )
        )
        .returning({ id: processingOutbox.id })
        .then((rows) => rows[0]);
      if (updated == null) return false;

      // Only preserve failure code if this is still the current pending revision
      await tx
        .update(sourceDocumentRevisions)
        .set({
          outcome: "failed",
          failureCode: "request_bound_retry_exhausted",
          finalizedAt: now,
        })
        .where(
          and(
            eq(sourceDocumentRevisions.id, row.revisionId),
            eq(sourceDocumentRevisions.outcome, "queued")
          )
        )
        .then();

      return true;
    });
  }
}

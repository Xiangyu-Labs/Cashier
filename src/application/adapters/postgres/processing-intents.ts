import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type {
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingPort,
  RecoverableProcessingIntentContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { lockSourceDocumentForUpdate } from "./transaction-locks";

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
      if (revision == null || revision.outcome !== "processing") return;

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

  async expireTimedOut(
    ledgerId: string,
    timeoutSeconds: number,
    limit: number
  ): Promise<number> {
    const deadline = new Date(this.now().getTime() - timeoutSeconds * 1000);
    const rows = await db
      .select({ id: processingOutbox.id })
      .from(processingOutbox)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocuments.pendingRevisionId, processingOutbox.revisionId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .innerJoin(
        sourceDocumentRevisions,
        and(
          eq(sourceDocumentRevisions.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocumentRevisions.id, processingOutbox.revisionId),
          eq(sourceDocumentRevisions.outcome, "processing")
        )
      )
      .where(
        and(
          eq(processingOutbox.ledgerId, ledgerId),
          lte(processingOutbox.createdAt, deadline),
          or(eq(processingOutbox.status, "pending"), eq(processingOutbox.status, "claimed"))
        )
      )
      .orderBy(asc(processingOutbox.createdAt))
      .limit(limit);

    let expired = 0;
    for (const row of rows) {
      if (await this.markTimedOut(row.id, deadline)) expired++;
    }
    return expired;
  }

  async markTimedOut(intentId: string, deadline: Date): Promise<boolean> {
    const now = this.now();
    return db.transaction(async (tx) => {
      const intent = await tx
        .select({
          ledgerId: processingOutbox.ledgerId,
          revisionId: processingOutbox.revisionId,
          attemptNumber: processingOutbox.attemptNumber,
          sourceDocumentId: sql<string>`${processingOutbox.payload}->>'sourceDocumentId'`,
        })
        .from(processingOutbox)
        .where(
          and(
            eq(processingOutbox.id, intentId),
            lte(processingOutbox.createdAt, deadline),
            or(eq(processingOutbox.status, "pending"), eq(processingOutbox.status, "claimed"))
          )
        )
        .then((rows) => rows[0]);
      if (intent == null || intent.sourceDocumentId == null) return false;

      let document;
      try {
        document = await lockSourceDocumentForUpdate(
          tx,
          intent.ledgerId,
          intent.sourceDocumentId
        );
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }
      if (document.pendingRevisionId !== intent.revisionId) return false;

      const revision = await tx
        .select({ outcome: sourceDocumentRevisions.outcome })
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, intent.ledgerId),
            eq(sourceDocumentRevisions.id, intent.revisionId),
            eq(sourceDocumentRevisions.sourceDocumentId, intent.sourceDocumentId)
          )
        )
        .then((rows) => rows[0]);
      if (revision?.outcome !== "processing") return false;

      const closed = await tx
        .update(processingOutbox)
        .set({
          status: "failed",
          completedAt: now,
          claimToken: null,
          claimExpiresAt: null,
        })
        .where(
          and(
            eq(processingOutbox.id, intentId),
            lte(processingOutbox.createdAt, deadline),
            or(eq(processingOutbox.status, "pending"), eq(processingOutbox.status, "claimed"))
          )
        )
        .returning({ id: processingOutbox.id })
        .then((rows) => rows[0]);
      if (closed == null) return false;

      await tx
        .update(processingAttempts)
        .set({
          status: "failed",
          completedAt: now,
          retryClassification: "permanent",
          diagnosticCode: "processing_timeout",
        })
        .where(
          and(
            eq(processingAttempts.revisionId, intent.revisionId),
            eq(processingAttempts.attemptNumber, intent.attemptNumber)
          )
        );
      await tx
        .update(sourceDocumentRevisions)
        .set({
          outcome: "failed",
          failureCode: "processing_timeout",
          finalizedAt: now,
        })
        .where(
          and(
            eq(sourceDocumentRevisions.id, intent.revisionId),
            eq(sourceDocumentRevisions.outcome, "processing")
          )
        );
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
   * is below maxAttempts, and whose revision is still the current
   * pending revision for the source document.
   * Ordered by next_available_at ASC, limited by `limit`.
   */
  async selectRecoverable(
    ledgerId: string,
    maxAttempts: number,
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
          lt(processingOutbox.scheduleAttemptCount, maxAttempts),
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
   * Finds and exhausts intents whose scheduleAttemptCount >= maxAttempts
   * but whose outbox is still non-terminal (pending or expired-claimed)
   * and whose revision is still the current pending revision.
   * Returns the number of intents exhausted.
   */
  async exhaustStaleIntents(
    ledgerId: string,
    maxAttempts: number,
    limit: number
  ): Promise<number> {
    const now = this.now();
    const rows = await db
      .select({
        id: processingOutbox.id,
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
          gte(processingOutbox.scheduleAttemptCount, maxAttempts),
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
      .limit(limit);

    let exhausted = 0;
    for (const row of rows) {
      const success = await this.markExhausted(row.id);
      if (success) exhausted++;
    }
    return exhausted;
  }

  /**
   * Marks an outbox intent as exhausted (failed with request_bound_retry_exhausted).
   *
   * CAS verification: joins the source document to ensure the revision is still
   * the current pending revision (document not deleted, exact pendingRevisionId,
   * revision outcome is processing). The outbox must be pending or
   * expired-claimed to be actionable.
   *
   * If CAS passes: updates the outbox, attempt record, and revision diagnostic
   * atomically within the transaction.
   *
   * If CAS fails (stale revision or newer pending exists): only closes the stale
   * outbox without touching the revision.
   */
  async markExhausted(intentId: string): Promise<boolean> {
    const now = this.now();
    return db.transaction(async (tx) => {
      // JOIN outbox with source documents and revisions to CAS-verify
      // that the revision is still the current pending revision
      const row = await tx
        .select({
          revisionId: processingOutbox.revisionId,
          outboxStatus: processingOutbox.status,
          claimExpiresAt: processingOutbox.claimExpiresAt,
          attemptNumber: processingOutbox.attemptNumber,
          documentDeletedAt: sourceDocuments.deletedAt,
          documentPendingRevisionId: sourceDocuments.pendingRevisionId,
          revisionOutcome: sourceDocumentRevisions.outcome,
        })
        .from(processingOutbox)
        .innerJoin(
          sourceDocuments,
          and(
            eq(sourceDocuments.ledgerId, processingOutbox.ledgerId),
            eq(sourceDocuments.id, sql`CAST(${processingOutbox.payload}->>'sourceDocumentId' AS text)`)
          )
        )
        .innerJoin(
          sourceDocumentRevisions,
          and(
            eq(sourceDocumentRevisions.ledgerId, processingOutbox.ledgerId),
            eq(sourceDocumentRevisions.id, processingOutbox.revisionId)
          )
        )
        .where(eq(processingOutbox.id, intentId))
        .then((rows) => rows[0]);
      if (row == null) return false;

      // Prerequisite: outbox must be pending or expired-claimed
      const isActionable =
        row.outboxStatus === "pending" ||
        (row.outboxStatus === "claimed" && row.claimExpiresAt != null && row.claimExpiresAt <= now);

      if (!isActionable) return false;

      // CAS: verify the revision is still the current pending revision
      const isCurrentPending =
        row.documentDeletedAt == null &&
        row.documentPendingRevisionId === row.revisionId &&
        row.revisionOutcome === "processing";

      // Update outbox to failed (common to both paths)
      const updated = await tx
        .update(processingOutbox)
        .set({
          status: "failed",
          completedAt: now,
          claimToken: null,
          claimExpiresAt: null,
        })
        .where(
          and(
            eq(processingOutbox.id, intentId),
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
      if (updated == null) return false;

      if (isCurrentPending) {
        // CAS passed — full exhaustion: update attempt record and revision
        await tx
          .update(processingAttempts)
          .set({
            status: "failed",
            completedAt: now,
            retryClassification: "permanent",
            diagnosticCode: "request_bound_retry_exhausted",
          })
          .where(
            and(
              eq(processingAttempts.revisionId, row.revisionId),
              eq(processingAttempts.attemptNumber, row.attemptNumber)
            )
          );

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
              eq(sourceDocumentRevisions.outcome, "processing")
            )
          );

        return true;
      }

      // CAS failed — only closed the stale outbox, did not touch the revision
      return true;
    });
  }
}

import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
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
import { lockLedgerForUpdate } from "./transaction-locks";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export interface PostgresProcessingIntentAdapterOptions {
  leaseMs?: number;
  now?: () => Date;
  onDispatch?: () => void;
}

function mapIntent(row: typeof processingOutbox.$inferSelect): ProcessingIntentContract {
  return {
    id: row.id,
    sourceDocumentId: row.sourceDocumentId,
    revisionId: row.revisionId,
    requestedAt: row.requestedAt.toISOString(),
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

      await tx
        .insert(processingAttempts)
        .values({
          ledgerId: revision.ledgerId,
          revisionId: intent.revisionId,
          attemptNumber: intent.attempt,
          status: "queued",
        })
        .onConflictDoNothing();
      await tx
        .insert(processingOutbox)
        .values({
          id: intent.id,
          ledgerId: revision.ledgerId,
          sourceDocumentId: intent.sourceDocumentId,
          revisionId: intent.revisionId,
          attemptNumber: intent.attempt,
          status: "pending",
          requestedAt: new Date(intent.requestedAt),
          availableAt: new Date(intent.requestedAt),
        })
        .onConflictDoNothing();
    });
    this.onDispatch?.();
  }

  async claim(intentId: string): Promise<ProcessingClaimContract | null> {
    return this.claimWhere(eq(processingOutbox.id, intentId));
  }

  async claimNext(): Promise<ProcessingClaimContract | null> {
    return this.claimWhere(sql`TRUE`);
  }

  private async claimWhere(
    identity: ReturnType<typeof eq>
  ): Promise<ProcessingClaimContract | null> {
    const now = this.now();
    const claimToken = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return db.transaction(async (tx) => {
      const claimed = await tx.execute<typeof processingOutbox.$inferSelect>(sql`
        WITH candidate AS (
          SELECT id FROM processing_outbox
          WHERE ${identity}
            AND available_at <= ${now}
            AND (status = 'pending' OR (status = 'claimed' AND claim_expires_at <= ${now}))
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE processing_outbox outbox
        SET status = 'claimed', claim_token = ${claimToken}, claimed_at = ${now},
            claim_expires_at = ${expiresAt}
        FROM candidate WHERE outbox.id = candidate.id
        RETURNING outbox.*
      `);
      const raw = claimed.rows?.[0] as Record<string, unknown> | undefined;
      const row =
        raw == null
          ? undefined
          : ({
              ...raw,
              sourceDocumentId: raw.source_document_id,
              revisionId: raw.revision_id,
              attemptNumber: raw.attempt_number,
              requestedAt: new Date(raw.requested_at as string | Date),
            } as typeof processingOutbox.$inferSelect);
      if (row == null) return null;
      const intent = mapIntent(row);
      await tx
        .update(processingAttempts)
        .set({ status: "processing", startedAt: now })
        .where(
          and(
            eq(processingAttempts.revisionId, row.revisionId),
            eq(processingAttempts.attemptNumber, row.attemptNumber),
            eq(processingAttempts.status, "queued")
          )
        );
      return { intent, claimToken, expiresAt: expiresAt.toISOString() };
    });
  }

  async renew(intentId: string, claimToken: string): Promise<string | null> {
    const expiresAt = new Date(this.now().getTime() + this.leaseMs);
    const renewed = await db
      .update(processingOutbox)
      .set({ claimExpiresAt: expiresAt })
      .where(
        and(
          eq(processingOutbox.id, intentId),
          eq(processingOutbox.status, "claimed"),
          eq(processingOutbox.claimToken, claimToken)
        )
      )
      .returning({ id: processingOutbox.id });
    return renewed.length === 1 ? expiresAt.toISOString() : null;
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
      await tx
        .update(processingAttempts)
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
        );
      return true;
    });
  }

  async reconcileResidualIntents(ledgerId: string, limit: number): Promise<number> {
    const candidates = await db
      .select({ id: processingOutbox.id })
      .from(processingOutbox)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocuments.id, processingOutbox.sourceDocumentId)
        )
      )
      .innerJoin(
        sourceDocumentRevisions,
        and(
          eq(sourceDocumentRevisions.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocumentRevisions.id, processingOutbox.revisionId)
        )
      )
      .where(
        and(
          eq(processingOutbox.ledgerId, ledgerId),
          inArray(processingOutbox.status, ["pending", "claimed"]),
          sql`(${sourceDocuments.deletedAt} IS NOT NULL OR ${sourceDocuments.pendingRevisionId} IS DISTINCT FROM ${processingOutbox.revisionId} OR ${sourceDocumentRevisions.outcome} <> 'processing')`
        )
      )
      .limit(limit);
    let reconciled = 0;
    for (const candidate of candidates) {
      const changed = await db.transaction(async (tx) => {
        await lockLedgerForUpdate(tx, ledgerId);
        const row = await tx
          .select({
            revisionId: processingOutbox.revisionId,
            attemptNumber: processingOutbox.attemptNumber,
            documentDeletedAt: sourceDocuments.deletedAt,
            pendingRevisionId: sourceDocuments.pendingRevisionId,
            revisionOutcome: sourceDocumentRevisions.outcome,
          })
          .from(sourceDocuments)
          .innerJoin(
            sourceDocumentRevisions,
            and(
              eq(sourceDocumentRevisions.ledgerId, sourceDocuments.ledgerId),
              eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id)
            )
          )
          .innerJoin(processingOutbox, eq(processingOutbox.revisionId, sourceDocumentRevisions.id))
          .where(and(eq(processingOutbox.id, candidate.id), eq(sourceDocuments.ledgerId, ledgerId)))
          .for("update")
          .then((rows) => rows[0]);
        if (row == null) return false;
        const stale = row.documentDeletedAt != null || row.pendingRevisionId !== row.revisionId;
        const outboxStatus =
          stale || ["cancelled", "abandoned"].includes(row.revisionOutcome)
            ? "cancelled"
            : row.revisionOutcome === "failed"
              ? "failed"
              : "completed";
        const attemptStatus =
          stale || row.revisionOutcome === "cancelled" || row.revisionOutcome === "abandoned"
            ? "cancelled"
            : row.revisionOutcome === "failed"
              ? "failed"
              : row.revisionOutcome === "anomaly"
                ? "anomaly"
                : "completed";
        const now = this.now();
        const updated = await tx
          .update(processingOutbox)
          .set({ status: outboxStatus, completedAt: now, claimToken: null, claimExpiresAt: null })
          .where(
            and(
              eq(processingOutbox.id, candidate.id),
              inArray(processingOutbox.status, ["pending", "claimed"])
            )
          )
          .returning({ id: processingOutbox.id });
        if (updated.length === 0) return false;
        await tx
          .update(processingAttempts)
          .set({ status: attemptStatus, completedAt: now })
          .where(
            and(
              eq(processingAttempts.revisionId, row.revisionId),
              eq(processingAttempts.attemptNumber, row.attemptNumber),
              inArray(processingAttempts.status, ["queued", "processing"])
            )
          );
        return true;
      });
      if (changed) reconciled += 1;
    }
    return reconciled;
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
            and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
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
        sourceDocumentId: processingOutbox.sourceDocumentId,
        revisionId: processingOutbox.revisionId,
        requestedAt: processingOutbox.requestedAt,
        attempt: processingOutbox.attemptNumber,
        scheduleAttemptCount: processingOutbox.scheduleAttemptCount,
        nextAvailableAt: processingOutbox.nextAvailableAt,
      })
      .from(processingOutbox)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.ledgerId, processingOutbox.ledgerId),
          eq(sourceDocuments.id, processingOutbox.sourceDocumentId),
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
            and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
          )
        )
      )
      .orderBy(asc(processingOutbox.nextAvailableAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      sourceDocumentId: row.sourceDocumentId,
      revisionId: row.revisionId,
      requestedAt: row.requestedAt.toISOString(),
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
  async exhaustStaleIntents(ledgerId: string, maxAttempts: number, limit: number): Promise<number> {
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
          eq(sourceDocuments.id, processingOutbox.sourceDocumentId),
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
            and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
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
            eq(sourceDocuments.id, processingOutbox.sourceDocumentId)
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
              and(eq(processingOutbox.status, "claimed"), lte(processingOutbox.claimExpiresAt, now))
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

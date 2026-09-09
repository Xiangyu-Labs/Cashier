import { and, eq, isNull, sql } from "drizzle-orm";
import type {
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingPort,
  ProcessingRecoveryConfig,
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
    const now = this.now();
    const claimToken = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return db.transaction(async (tx) => {
      const claimed = await tx.execute<typeof processingOutbox.$inferSelect>(sql`
        WITH candidate AS (
          SELECT id FROM processing_outbox
          WHERE id = ${intentId}
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
              ledgerId: raw.ledger_id,
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
      return {
        ledgerId: row.ledgerId,
        intent,
        claimToken,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async recoverBatch(
    ledgerId: string,
    config: ProcessingRecoveryConfig
  ): Promise<readonly RecoverableProcessingIntentContract[]> {
    const now = this.now();
    const nextAvailable = new Date(now.getTime() + config.cooldownSeconds * 1000);

    return db.transaction(async (tx) => {
      await lockLedgerForUpdate(tx, ledgerId);

      await tx.execute(sql`
        WITH candidate AS (
          SELECT outbox.id, outbox.revision_id, outbox.attempt_number,
            CASE
              WHEN document.deleted_at IS NOT NULL
                OR document.pending_revision_id IS DISTINCT FROM outbox.revision_id
                OR revision.outcome IN ('cancelled', 'abandoned')
              THEN 'cancelled'
              WHEN revision.outcome = 'failed' THEN 'failed'
              ELSE 'completed'
            END AS outbox_status,
            CASE
              WHEN document.deleted_at IS NOT NULL
                OR document.pending_revision_id IS DISTINCT FROM outbox.revision_id
                OR revision.outcome IN ('cancelled', 'abandoned')
              THEN 'cancelled'
              WHEN revision.outcome = 'failed' THEN 'failed'
              WHEN revision.outcome = 'invalid' THEN 'invalid'
              ELSE 'completed'
            END AS attempt_status
          FROM processing_outbox outbox
          JOIN source_documents document
            ON document.ledger_id = outbox.ledger_id
           AND document.id = outbox.source_document_id
          JOIN source_document_revisions revision
            ON revision.ledger_id = outbox.ledger_id
           AND revision.id = outbox.revision_id
          WHERE outbox.ledger_id = ${ledgerId}
            AND outbox.status IN ('pending', 'claimed')
            AND (
              document.deleted_at IS NOT NULL
              OR document.pending_revision_id IS DISTINCT FROM outbox.revision_id
              OR revision.outcome <> 'processing'
            )
          ORDER BY outbox.created_at, outbox.id
          FOR UPDATE OF outbox SKIP LOCKED
          LIMIT ${config.maxBatch}
        ), closed AS (
          UPDATE processing_outbox outbox
          SET status = candidate.outbox_status::processing_outbox_status,
              completed_at = ${now}, claim_token = NULL, claim_expires_at = NULL
          FROM candidate
          WHERE outbox.id = candidate.id
            AND outbox.status IN ('pending', 'claimed')
          RETURNING candidate.revision_id, candidate.attempt_number, candidate.attempt_status
        ), updated_attempts AS (
          UPDATE processing_attempts attempt
          SET status = closed.attempt_status::processing_attempt_status, completed_at = ${now}
          FROM closed
          WHERE attempt.revision_id = closed.revision_id
            AND attempt.attempt_number = closed.attempt_number
            AND attempt.status IN ('queued', 'processing')
          RETURNING attempt.id
        )
        SELECT count(*) FROM closed
      `);

      await tx.execute(sql`
        WITH candidate AS (
          SELECT outbox.id, outbox.revision_id, outbox.attempt_number
          FROM processing_outbox outbox
          JOIN source_documents document
            ON document.ledger_id = outbox.ledger_id
           AND document.id = outbox.source_document_id
           AND document.pending_revision_id = outbox.revision_id
           AND document.deleted_at IS NULL
          JOIN source_document_revisions revision
            ON revision.ledger_id = outbox.ledger_id
           AND revision.id = outbox.revision_id
           AND revision.outcome = 'processing'
          WHERE outbox.ledger_id = ${ledgerId}
            AND outbox.schedule_attempt_count >= ${config.maxAttempts}
            AND outbox.next_available_at <= ${now}
            AND (
              outbox.status = 'pending'
              OR (outbox.status = 'claimed' AND outbox.claim_expires_at <= ${now})
            )
          ORDER BY outbox.next_available_at, outbox.created_at, outbox.id
          FOR UPDATE OF outbox SKIP LOCKED
          LIMIT ${config.maxBatch}
        ), closed AS (
          UPDATE processing_outbox outbox
          SET status = 'failed', completed_at = ${now}, claim_token = NULL, claim_expires_at = NULL
          FROM candidate
          WHERE outbox.id = candidate.id
          RETURNING candidate.revision_id, candidate.attempt_number
        ), updated_attempts AS (
          UPDATE processing_attempts attempt
          SET status = 'failed', completed_at = ${now}, retry_classification = 'permanent',
              diagnostic_code = 'request_bound_retry_exhausted'
          FROM closed
          WHERE attempt.revision_id = closed.revision_id
            AND attempt.attempt_number = closed.attempt_number
          RETURNING attempt.id
        ), updated_revisions AS (
          UPDATE source_document_revisions revision
          SET outcome = 'failed', failure_code = 'request_bound_retry_exhausted',
              finalized_at = ${now}
          FROM closed
          WHERE revision.id = closed.revision_id AND revision.outcome = 'processing'
          RETURNING revision.id
        )
        SELECT count(*) FROM closed
      `);

      const scheduled = await tx.execute<{
        id: string;
        sourceDocumentId: string;
        revisionId: string;
        requestedAt: Date | string;
        attempt: number;
        scheduleAttemptCount: number;
        nextAvailableAt: Date | string;
      }>(sql`
        WITH candidate AS (
          SELECT outbox.id
          FROM processing_outbox outbox
          JOIN source_documents document
            ON document.ledger_id = outbox.ledger_id
           AND document.id = outbox.source_document_id
           AND document.pending_revision_id = outbox.revision_id
           AND document.deleted_at IS NULL
          JOIN source_document_revisions revision
            ON revision.ledger_id = outbox.ledger_id
           AND revision.id = outbox.revision_id
           AND revision.outcome = 'processing'
          WHERE outbox.ledger_id = ${ledgerId}
            AND outbox.schedule_attempt_count < ${config.maxAttempts}
            AND outbox.next_available_at <= ${now}
            AND (
              outbox.status = 'pending'
              OR (outbox.status = 'claimed' AND outbox.claim_expires_at <= ${now})
            )
          ORDER BY outbox.next_available_at, outbox.created_at, outbox.id
          FOR UPDATE OF outbox SKIP LOCKED
          LIMIT ${config.maxBatch}
        )
        UPDATE processing_outbox outbox
        SET schedule_attempt_count = outbox.schedule_attempt_count + 1,
            last_scheduled_at = ${now}, next_available_at = ${nextAvailable}
        FROM candidate
        WHERE outbox.id = candidate.id
        RETURNING outbox.id,
          outbox.source_document_id AS "sourceDocumentId",
          outbox.revision_id AS "revisionId",
          outbox.requested_at AS "requestedAt",
          outbox.attempt_number AS attempt,
          outbox.schedule_attempt_count AS "scheduleAttemptCount",
          outbox.next_available_at AS "nextAvailableAt"
      `);

      return scheduled.rows.map((row) => ({
        ...row,
        requestedAt:
          typeof row.requestedAt === "string" ? row.requestedAt : row.requestedAt.toISOString(),
        nextAvailableAt:
          typeof row.nextAvailableAt === "string"
            ? row.nextAvailableAt
            : row.nextAvailableAt.toISOString(),
      }));
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
            result.outcome === "invalid"
              ? "invalid"
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
}

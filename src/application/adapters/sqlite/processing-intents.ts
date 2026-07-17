import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type {
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingPort,
} from "@/application/contracts";
import { db } from "@/lib/db";
import {
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export interface SqliteProcessingIntentAdapterOptions {
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

export class SqliteProcessingIntentAdapter implements ProcessingPort {
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly onDispatch: (() => void) | undefined;

  constructor(options: SqliteProcessingIntentAdapterOptions = {}) {
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.now = options.now ?? (() => new Date());
    this.onDispatch = options.onDispatch;
  }

  async dispatch(intent: ProcessingIntentContract): Promise<void> {
    db.transaction((tx) => {
      const revision = tx
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
        .get();
      if (revision == null || !["queued", "processing"].includes(revision.outcome)) return;

      tx.insert(processingAttempts)
        .values({
          ledgerId: revision.ledgerId,
          revisionId: intent.revisionId,
          attemptNumber: intent.attempt,
          status: "queued",
        })
        .onConflictDoNothing()
        .run();
      tx.insert(processingOutbox)
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
        .run();
    });
    this.onDispatch?.();
  }

  async claim(intentId: string): Promise<ProcessingClaimContract | null> {
    return this.claimWhere(eq(processingOutbox.id, intentId));
  }

  async claimNext(): Promise<ProcessingClaimContract | null> {
    const now = this.now();
    const candidate = db
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
      .get();
    return candidate == null ? null : this.claim(candidate.id);
  }

  private async claimWhere(
    identity: ReturnType<typeof eq>
  ): Promise<ProcessingClaimContract | null> {
    const now = this.now();
    const claimToken = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return db.transaction((tx) => {
      const row = tx
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
        .get();
      if (row == null) return null;
      const intent = mapIntent(row);
      tx.update(processingAttempts)
        .set({ status: "processing", startedAt: now })
        .where(
          and(
            eq(processingAttempts.revisionId, row.revisionId),
            eq(processingAttempts.attemptNumber, row.attemptNumber),
            eq(processingAttempts.status, "queued")
          )
        )
        .run();
      tx.update(sourceDocumentRevisions)
        .set({ outcome: "processing" })
        .where(
          and(
            eq(sourceDocumentRevisions.id, row.revisionId),
            eq(sourceDocumentRevisions.outcome, "queued")
          )
        )
        .run();
      return { intent, claimToken, expiresAt: expiresAt.toISOString() };
    });
  }

  async complete(result: ProcessingCompletionContract): Promise<boolean> {
    const now = this.now();
    return db.transaction((tx) => {
      const row = tx
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
        .get();
      if (row == null) return false;
      tx.update(processingAttempts)
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
        .run();
      return true;
    });
  }
}

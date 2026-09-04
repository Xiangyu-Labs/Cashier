import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  PendingRevisionSubmissionContract,
  SourceDocumentIdempotencyInput,
  SourceDocumentSubmissionInput,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { db } from "@/lib/db";
import {
  ConflictError,
  NotFoundError,
  StaleSourceDocumentVersionError,
  ValidationError,
} from "@/lib/errors";
import {
  idempotencyRecords,
  processingAttempts,
  processingOutbox,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createPendingRevisionInTransaction } from "./revisions";
import type { PostgresTransaction } from "./transaction-locks";

const IDEMPOTENCY_WAIT_ATTEMPTS = 10;
const IDEMPOTENCY_LEASE_MS = 30_000;
const IDEMPOTENCY_RENEW_INTERVAL_MS = 10_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPendingWithIntentInTransaction(
  tx: PostgresTransaction,
  input: SourceDocumentSubmissionInput
): Promise<PendingRevisionSubmissionContract> {
  const intentId = crypto.randomUUID();
  const requestedAt = new Date();
  let submittedText = input.submittedText;
  let storedFileIds = input.storedFileIds;

  if (input.inheritEvidence === true && input.sourceDocumentId != null) {
    const document = await tx
      .select({
        activeRevisionId: sourceDocuments.activeRevisionId,
        pendingRevisionId: sourceDocuments.pendingRevisionId,
        stateVersion: sourceDocuments.stateVersion,
      })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, input.ledgerId),
          eq(sourceDocuments.id, input.sourceDocumentId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .for("update")
      .then((rows) => rows[0]);
    if (document == null) throw new NotFoundError("Source document");
    if (input.expectedVersion != null && document.stateVersion !== input.expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        input.sourceDocumentId,
        input.expectedVersion,
        document.stateVersion
      );
    }
    const evidenceRevisionId = document?.pendingRevisionId ?? document?.activeRevisionId;

    if (submittedText === undefined) {
      const evidenceRevision =
        evidenceRevisionId == null
          ? null
          : await tx
              .select({ submittedText: sourceDocumentRevisions.submittedText })
              .from(sourceDocumentRevisions)
              .where(
                and(
                  eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
                  eq(sourceDocumentRevisions.id, evidenceRevisionId),
                  eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId)
                )
              )
              .then((rows) => rows[0]);
      submittedText = evidenceRevision?.submittedText ?? null;
    }

    if (storedFileIds === undefined && evidenceRevisionId != null) {
      storedFileIds = (
        await tx
          .select({ id: revisionFiles.storedFileId })
          .from(revisionFiles)
          .where(
            and(
              eq(revisionFiles.ledgerId, input.ledgerId),
              eq(revisionFiles.revisionId, evidenceRevisionId)
            )
          )
          .orderBy(asc(revisionFiles.position))
      ).map((file) => file.id);
    }

    if (input.supersedeProcessing === true && document?.pendingRevisionId != null) {
      const now = new Date();
      const pendingRevision = await tx
        .select({ outcome: sourceDocumentRevisions.outcome })
        .from(sourceDocumentRevisions)
        .where(eq(sourceDocumentRevisions.id, document.pendingRevisionId))
        .then((rows) => rows[0]);
      const supersededRevision = await tx
        .update(sourceDocumentRevisions)
        .set({
          outcome: pendingRevision?.outcome === "processing" ? "cancelled" : "abandoned",
          finalizedAt: now,
        })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.id, document.pendingRevisionId),
            inArray(sourceDocumentRevisions.outcome, ["processing", "completed"])
          )
        )
        .returning({ id: sourceDocumentRevisions.id })
        .then((rows) => rows[0]);

      if (supersededRevision != null) {
        await tx
          .update(processingOutbox)
          .set({
            status: "cancelled",
            completedAt: now,
            claimToken: null,
            claimExpiresAt: null,
          })
          .where(
            and(
              eq(processingOutbox.revisionId, supersededRevision.id),
              inArray(processingOutbox.status, ["pending", "claimed"])
            )
          );
        await tx
          .update(processingAttempts)
          .set({
            status: "cancelled",
            completedAt: now,
            diagnosticCode: "superseded_by_retry",
          })
          .where(
            and(
              eq(processingAttempts.revisionId, supersededRevision.id),
              inArray(processingAttempts.status, ["queued", "processing"])
            )
          );
        await tx
          .update(sourceDocuments)
          .set({ pendingRevisionId: null, updatedAt: now })
          .where(
            and(
              eq(sourceDocuments.ledgerId, input.ledgerId),
              eq(sourceDocuments.id, input.sourceDocumentId),
              eq(sourceDocuments.pendingRevisionId, supersededRevision.id)
            )
          );
      }
    }
  }

  const pending = await createPendingRevisionInTransaction(tx, {
    ledgerId: input.ledgerId,
    ...(input.sourceDocumentId === undefined ? {} : { sourceDocumentId: input.sourceDocumentId }),
    ...(submittedText === undefined ? {} : { submittedText }),
    ...(storedFileIds === undefined ? {} : { storedFileIds }),
    ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
  });
  const intent = {
    id: intentId,
    sourceDocumentId: pending.document.id,
    revisionId: pending.revision.id,
    requestedAt: requestedAt.toISOString(),
    attempt: 1,
  };

  await tx.insert(processingAttempts).values({
    ledgerId: input.ledgerId,
    revisionId: pending.revision.id,
    attemptNumber: intent.attempt,
    status: "queued",
  });
  await tx.insert(processingOutbox).values({
    id: intent.id,
    ledgerId: input.ledgerId,
    sourceDocumentId: intent.sourceDocumentId,
    revisionId: pending.revision.id,
    attemptNumber: intent.attempt,
    status: "pending",
    requestedAt,
    availableAt: requestedAt,
  });

  return { ...pending, intent };
}

async function createIdempotentSubmission(
  idempotency: SourceDocumentIdempotencyInput,
  prepare: () => Promise<SourceDocumentSubmissionInput>
): Promise<PendingRevisionSubmissionContract> {
  const { principalType, principalId, key, contentFingerprint } = idempotency;
  if (key.trim() === "" || key.length > 512) {
    throw new ValidationError("Idempotency key must contain between 1 and 512 characters");
  }

  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const claimed = await db
    .insert(idempotencyRecords)
    .values({
      principalType,
      principalId,
      key,
      status: "pending",
      contentFingerprint,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + IDEMPOTENCY_LEASE_MS),
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    })
    .onConflictDoUpdate({
      target: [
        idempotencyRecords.principalType,
        idempotencyRecords.principalId,
        idempotencyRecords.key,
      ],
      set: {
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + IDEMPOTENCY_LEASE_MS),
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      },
      setWhere: sql`${idempotencyRecords.status} = 'pending'
        AND ${idempotencyRecords.leaseExpiresAt} < ${now}
        AND ${idempotencyRecords.contentFingerprint} IS NOT DISTINCT FROM ${contentFingerprint}`,
    })
    .returning({ key: idempotencyRecords.key });

  if (claimed.length === 1) {
    const renewLease = async () => {
      const renewedAt = new Date();
      await db
        .update(idempotencyRecords)
        .set({ leaseExpiresAt: new Date(renewedAt.getTime() + IDEMPOTENCY_LEASE_MS) })
        .where(
          and(
            eq(idempotencyRecords.principalType, principalType),
            eq(idempotencyRecords.principalId, principalId),
            eq(idempotencyRecords.key, key),
            eq(idempotencyRecords.status, "pending"),
            eq(idempotencyRecords.leaseToken, leaseToken)
          )
        );
    };
    const heartbeat = setInterval(() => {
      void renewLease().catch(() => {
        // The final fencing-token update remains authoritative if renewal fails.
      });
    }, IDEMPOTENCY_RENEW_INTERVAL_MS);
    try {
      const input = await prepare();
      return await db.transaction(async (tx) => {
        const submission = await createPendingWithIntentInTransaction(tx, input);
        const committed = await tx
          .update(idempotencyRecords)
          .set({
            status: "completed",
            result: { value: submission },
            completedAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(idempotencyRecords.principalType, principalType),
              eq(idempotencyRecords.principalId, principalId),
              eq(idempotencyRecords.key, key),
              eq(idempotencyRecords.leaseToken, leaseToken)
            )
          )
          .returning({ key: idempotencyRecords.key });
        if (committed.length !== 1) {
          throw new ConflictError("The idempotency lease expired before submission commit");
        }
        return submission;
      });
    } catch (error) {
      await db
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.principalType, principalType),
            eq(idempotencyRecords.principalId, principalId),
            eq(idempotencyRecords.key, key),
            eq(idempotencyRecords.leaseToken, leaseToken)
          )
        );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
    const record = await db.query.idempotencyRecords.findFirst({
      where: and(
        eq(idempotencyRecords.principalType, principalType),
        eq(idempotencyRecords.principalId, principalId),
        eq(idempotencyRecords.key, key)
      ),
    });
    if (record != null && record.contentFingerprint !== contentFingerprint) {
      throw new ConflictError("Idempotency key was already used with different content");
    }
    if (record?.status === "completed") {
      const submission = (record.result as { value: PendingRevisionSubmissionContract }).value;
      return { ...submission, idempotencyReplay: true };
    }
    if (record == null || (record.leaseExpiresAt != null && record.leaseExpiresAt <= new Date())) {
      return createIdempotentSubmission(idempotency, prepare);
    }
    await wait(Math.min(25 * 2 ** attempt, 500));
  }
  throw new ConflictError("The idempotent request is still in progress");
}

export const postgresSourceDocumentSubmissionAdapter: SourceDocumentSubmissionPort = {
  async createPendingWithIntent(input): Promise<PendingRevisionSubmissionContract> {
    return db.transaction((tx) => createPendingWithIntentInTransaction(tx, input));
  },
  async createIdempotentPendingWithIntent(idempotency, prepare) {
    return createIdempotentSubmission(idempotency, prepare);
  },
};

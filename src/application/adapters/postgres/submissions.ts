import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  PendingRevisionSubmissionContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { db } from "@/lib/db";
import {
  processingAttempts,
  processingOutbox,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createPendingRevisionInTransaction } from "./revisions";

export const postgresSourceDocumentSubmissionAdapter: SourceDocumentSubmissionPort = {
  async createPendingWithIntent(input): Promise<PendingRevisionSubmissionContract> {
    const intentId = crypto.randomUUID();
    const requestedAt = new Date();

    return db.transaction(async (tx) => {
      let submittedText = input.submittedText;
      let storedFileIds = input.storedFileIds;

      if (input.inheritEvidence === true && input.sourceDocumentId != null) {
        const document = await tx
          .select({
            activeRevisionId: sourceDocuments.activeRevisionId,
            pendingRevisionId: sourceDocuments.pendingRevisionId,
          })
          .from(sourceDocuments)
          .where(
            and(
              eq(sourceDocuments.ledgerId, input.ledgerId),
              eq(sourceDocuments.id, input.sourceDocumentId)
            )
          )
          .for("update")
          .then((rows) => rows[0]);
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
          const supersededRevision = await tx
            .update(sourceDocumentRevisions)
            .set({ outcome: "abandoned", finalizedAt: now })
            .where(
              and(
                eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
                eq(sourceDocumentRevisions.id, document.pendingRevisionId),
                eq(sourceDocumentRevisions.outcome, "processing")
              )
            )
            .returning({ id: sourceDocumentRevisions.id })
            .then((rows) => rows[0]);

          if (supersededRevision != null) {
            await tx
              .update(processingOutbox)
              .set({
                status: "failed",
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
                status: "failed",
                completedAt: now,
                retryClassification: "permanent",
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
        ...(input.sourceDocumentId === undefined
          ? {}
          : { sourceDocumentId: input.sourceDocumentId }),
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
        revisionId: pending.revision.id,
        attemptNumber: intent.attempt,
        idempotencyKey: intent.id,
        status: "pending",
        payload: {
          sourceDocumentId: intent.sourceDocumentId,
          requestedAt: intent.requestedAt,
        },
        availableAt: requestedAt,
      });

      return { ...pending, intent };
    });
  },
};

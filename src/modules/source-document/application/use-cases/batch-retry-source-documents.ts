import { db } from "@/lib/db";
import { cancelFlowTask } from "@/lib/flow";
import { logger } from "@/lib/logger";
import type { BatchRetrySourceDocumentsResultDto } from "@/modules/source-document/contracts";
import { sourceDocuments, taskRuns, type Ledger } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getSourceDocumentTaskContext, prepareSourceDocumentTask } from "../services/processing";
import {
  deletedSourceDocumentPatch,
  whereSourceDocumentNotDeleted,
} from "../source-document-state";
import { rehomeLocalUploadUrls } from "../services/rehome-local-upload-urls";

export interface BatchRetrySourceDocumentsInput {
  ledgerId: string;
  ledger: Ledger;
  sourceDocumentIds: string[];
}

export async function batchRetrySourceDocuments({
  ledgerId,
  ledger,
  sourceDocumentIds,
}: BatchRetrySourceDocumentsInput): Promise<BatchRetrySourceDocumentsResultDto> {
  if (sourceDocumentIds.length === 0) {
    logger.debug({ ledgerId }, "Batch retry called with empty document list");
    return {
      results: [],
      retriedCount: 0,
      failedCount: 0,
    };
  }

  const oldDocs = await db.query.sourceDocuments.findMany({
    where: and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)),
  });

  if (oldDocs.length === 0) {
    logger.debug({ ledgerId, sourceDocumentIds }, "No active documents found for batch retry");
    return {
      results: [],
      retriedCount: 0,
      failedCount: 0,
    };
  }

  const relatedTaskRuns = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.scopeId, ledgerId),
      eq(taskRuns.entityType, "source_document"),
      inArray(taskRuns.entityId, sourceDocumentIds)
    ),
  });

  const newDocMappings = await Promise.all(
    oldDocs.map(async (oldDoc) => {
      const newDocId = crypto.randomUUID();
      const imageUrls = await rehomeLocalUploadUrls({
        ledgerId,
        sourceDocumentId: newDocId,
        imageUrls: oldDoc.imageUrls ?? [],
      });
      const originalImageUrls = Array.isArray(oldDoc.metadata?.originalImageUrls)
        ? await rehomeLocalUploadUrls({
            ledgerId,
            sourceDocumentId: newDocId,
            imageUrls: oldDoc.metadata.originalImageUrls.filter(
              (url): url is string => typeof url === "string" && url !== ""
            ),
          })
        : [];

      return {
        oldDocId: oldDoc.id,
        newDocId,
        text: oldDoc.text,
        entryDate: oldDoc.entryDate,
        imageUrls,
        originalImageUrls,
      };
    })
  );

  await db.insert(sourceDocuments).values(
    newDocMappings.map((mapping) => ({
      id: mapping.newDocId,
      ledgerId,
      entryDate: mapping.entryDate,
      text: mapping.text,
      imageUrls: mapping.imageUrls,
      status: "queued" as const,
      type: "ai_parsed" as const,
      title: null,
      metadata:
        mapping.originalImageUrls.length > 0
          ? { originalImageUrls: mapping.originalImageUrls }
          : {},
    }))
  );

  logger.debug(
    { ledgerId, count: newDocMappings.length },
    "Created new source documents for batch retry"
  );

  await db
    .update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(
      and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds))
    );

  logger.debug(
    { ledgerId, oldDocIds: sourceDocumentIds },
    "Soft deleted old source documents for batch retry"
  );

  const runningTasks = relatedTaskRuns.filter(
    (task) => task.status === "pending" || task.status === "running"
  );
  for (const task of runningTasks) {
    await cancelFlowTask(task.id);
  }

  const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);
  if (taskIdsToDelete.length > 0) {
    await db
      .update(taskRuns)
      .set({ deletedAt: new Date() })
      .where(inArray(taskRuns.id, taskIdsToDelete));
  }

  const taskContext = await getSourceDocumentTaskContext(ledgerId, ledger);
  const taskSubmissionResults = await Promise.allSettled(
    newDocMappings.map(async (mapping) =>
      prepareSourceDocumentTask({
        ledgerId,
        sourceDocumentId: mapping.newDocId,
        imageUrls: mapping.imageUrls,
        categories: taskContext.categories,
        settings: taskContext.settings,
        ...(mapping.text !== null ? { text: mapping.text } : {}),
      })
    )
  );

  const failures = taskSubmissionResults.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    logger.warn(
      { ledgerId, failedCount: failures.length, totalCount: newDocMappings.length },
      "Some documents failed to retry in batch operation"
    );
  }

  return {
    results: newDocMappings.map((mapping, index) => ({
      previousSourceDocumentId: mapping.oldDocId,
      sourceDocumentId: mapping.newDocId,
      status: "queued" as const,
      taskSubmitted: taskSubmissionResults[index]?.status === "fulfilled",
    })),
    retriedCount: newDocMappings.length,
    failedCount: failures.length,
  };
}

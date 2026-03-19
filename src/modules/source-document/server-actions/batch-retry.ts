"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/persistence";
import { requireLedgerAccess } from "@/modules/auth/access";
import { cancelFlowTask, submitFlowTask } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getSourceDocumentTaskContext } from "./helpers";
import { logger } from "@/lib/logger";
import type { BatchRetrySourceDocumentsResultDto } from "@/modules/source-document/contracts";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../application/tasks/parse-source-document";

/**
 * Batch retry multiple source documents
 *
 * New approach: Batch retry = soft delete old documents + create brand new documents
 * This decouples "cancel task" from "retain/delete document" logic.
 * Note: Batch retry does not have editing functionality, uses original text and imageUrls.
 */
export async function batchRetrySourceDocumentsAction(
  ledgerId: string,
  sourceDocumentIds: string[]
): Promise<BatchRetrySourceDocumentsResultDto> {
  const { ledger } = await requireLedgerAccess(ledgerId);

  if (sourceDocumentIds.length === 0) {
    logger.debug({ ledgerId }, "Batch retry called with empty document list");
    return {
      results: [],
      retriedCount: 0,
      failedCount: 0,
    };
  }

  const q = forLedger(sourceDocuments, ledgerId);

  // 1. Fetch all old documents to get their data
  const oldDocs = await db.query.sourceDocuments.findMany({
    where: and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)),
  });

  if (oldDocs.length === 0) {
    logger.debug({ ledgerId, sourceDocumentIds }, "No active documents found for batch retry");
    return {
      results: [],
      retriedCount: 0,
      failedCount: 0,
    };
  }

  // 2. Find all related task_runs before creating new documents
  const relatedTaskRuns = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.scopeId, ledgerId),
      eq(taskRuns.entityType, "source_document"),
      inArray(taskRuns.entityId, sourceDocumentIds)
    ),
  });

  // 3. Create new documents for each old document (preserving only ledgerId and entryDate)
  const newDocMappings: Array<{
    oldDocId: string;
    newDocId: string;
    text: string | null;
    entryDate: string | null;
    imageUrls: string[];
  }> = [];

  for (const oldDoc of oldDocs) {
    const newDocId = crypto.randomUUID();
    newDocMappings.push({
      oldDocId: oldDoc.id,
      newDocId,
      text: oldDoc.text,
      entryDate: oldDoc.entryDate,
      imageUrls: oldDoc.imageUrls ?? [],
    });
  }

  // Insert all new documents
  await db.insert(sourceDocuments).values(
    newDocMappings.map((mapping) => ({
      id: mapping.newDocId,
      ledgerId: ledgerId,
      entryDate: mapping.entryDate,
      text: mapping.text,
      imageUrls: mapping.imageUrls,
      status: "queued" as const,
      type: "ai_parsed" as const,
      title: null, // Let AI regenerate title
      metadata: {}, // Empty metadata for fresh parse
    }))
  );

  logger.debug(
    { ledgerId, count: newDocMappings.length },
    "Created new source documents for batch retry"
  );

  // 4. Soft delete old documents
  await db
    .update(sourceDocuments)
    .set({ deletedAt: new Date() })
    .where(and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)));

  logger.debug(
    { ledgerId, oldDocIds: sourceDocumentIds },
    "Soft deleted old source documents for batch retry"
  );

  // 5. Cancel any running/pending tasks for old documents
  // Note: handleParseCancel will be triggered but old docs are already soft deleted
  const runningTasks = relatedTaskRuns.filter(
    (task) => task.status === "pending" || task.status === "running"
  );
  for (const task of runningTasks) {
    await cancelFlowTask(task.id);
  }

  // 6. Soft delete old task_runs for old documents (clean up)
  const taskIdsToDelete = relatedTaskRuns.map((t) => t.id);
  if (taskIdsToDelete.length > 0) {
    await db
      .update(taskRuns)
      .set({ deletedAt: new Date() })
      .where(inArray(taskRuns.id, taskIdsToDelete));
  }

  // 7. Submit new tasks for each new document using Promise.allSettled to handle partial failures
  const { categories, settings } = await getSourceDocumentTaskContext(ledgerId, ledger);

  const taskSubmissionResults = await Promise.allSettled(
    newDocMappings.map(async (mapping) => {
      const taskInput = {
        ledgerId,
        sourceDocumentId: mapping.newDocId,
        imageUrls: mapping.imageUrls,
        aiLanguage: settings.aiLanguage,
        categories,
        settings: {
          ...(settings.settings.aiCustomPrompt !== undefined
            ? { aiCustomPrompt: settings.settings.aiCustomPrompt }
            : {}),
        },
        ...(mapping.text !== null ? { text: mapping.text } : {}),
        ...(settings.preferredCurrencies !== undefined
          ? { preferredCurrencies: settings.preferredCurrencies }
          : {}),
      };

      await submitFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, taskInput, {
        title: "Parse source document",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: mapping.newDocId,
      });
    })
  );

  // Log any failures but don't fail the entire batch
  const failures = taskSubmissionResults.filter((r) => r.status === "rejected");
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

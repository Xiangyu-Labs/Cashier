"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/persistence";
import { requireLedgerAccess } from "@/modules/auth/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getSourceDocumentTaskContext, prepareSourceDocumentTask } from "./helpers";
import { logger } from "@/lib/logger";

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
): Promise<void> {
  const { ledger } = await requireLedgerAccess(ledgerId);

  if (sourceDocumentIds.length === 0) {
    logger.debug({ ledgerId }, "Batch retry called with empty document list");
    return;
  }

  const q = forLedger(sourceDocuments, ledgerId);

  // 1. Fetch all old documents to get their data
  const oldDocs = await db.query.sourceDocuments.findMany({
    where: and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)),
  });

  if (oldDocs.length === 0) {
    logger.debug({ ledgerId, sourceDocumentIds }, "No active documents found for batch retry");
    return;
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
    text: string | undefined;
    imageUrls: string[];
  }> = [];

  for (const oldDoc of oldDocs) {
    const newDocId = crypto.randomUUID();
    newDocMappings.push({
      oldDocId: oldDoc.id,
      newDocId,
      text: oldDoc.text ?? undefined,
      imageUrls: oldDoc.imageUrls ?? [],
    });
  }

  // Insert all new documents
  await db.insert(sourceDocuments).values(
    newDocMappings.map((mapping) => ({
      id: mapping.newDocId,
      ledgerId: ledgerId,
      entryDate: oldDocs.find((d) => d.id === mapping.oldDocId)?.entryDate,
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
    await flowEngine.cancel(task.id);
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

  const results = await Promise.allSettled(
    newDocMappings.map(async (mapping) => {
      await prepareSourceDocumentTask({
        ledgerId,
        sourceDocumentId: mapping.newDocId,
        text: mapping.text,
        imageUrls: mapping.imageUrls,
        categories,
        settings,
      });
    })
  );

  // Log any failures but don't fail the entire batch
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    logger.warn(
      { ledgerId, failedCount: failures.length, totalCount: newDocMappings.length },
      "Some documents failed to retry in batch operation"
    );
  }
}

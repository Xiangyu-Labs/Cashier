import { and, eq, inArray, isNull } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import { NotFoundError } from "@/lib/errors";
import { cancelFlowTask } from "@/lib/flow";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  getSourceDocumentTaskContext,
  prepareSourceDocumentTask,
  processImages,
} from "../services/processing";
import { rehomeLocalUploadUrls } from "../services/rehome-local-upload-urls";
import { sourceDocuments, taskRuns, type Ledger } from "@/persistence";

interface SourceDocumentRetryPayload {
  text?: string;
  images?: { data: string; mimeType: string }[];
  originalImages?: { data: string; mimeType: string }[];
  entryDate?: string;
}

interface RetrySourceDocumentInput {
  ledgerId: string;
  ledger: Ledger;
  sourceDocumentId: string;
  input?: SourceDocumentRetryPayload;
}

export async function retrySourceDocument({
  ledgerId,
  ledger,
  sourceDocumentId,
  input,
}: RetrySourceDocumentInput): Promise<RetrySourceDocumentResponseDto> {
  const q = forLedger(sourceDocuments, ledgerId);
  const existingDocument = await db.query.sourceDocuments.findFirst({
    where: q.whereId(sourceDocumentId),
  });

  if (existingDocument == null) {
    throw new NotFoundError("Source document");
  }

  const newDocumentId = crypto.randomUUID();
  const text = input?.text ?? existingDocument.text;
  const images = input?.images;
  const originalImages = input?.originalImages;
  const existingOriginalImageUrls = Array.isArray(existingDocument.metadata?.originalImageUrls)
    ? existingDocument.metadata.originalImageUrls
    : [];

  const processedImageUrls = images
    ? await processImages(images, ledgerId, newDocumentId)
    : undefined;
  const finalImageUrls =
    processedImageUrls != null && processedImageUrls.length > 0
      ? processedImageUrls
      : await rehomeLocalUploadUrls({
          ledgerId,
          sourceDocumentId: newDocumentId,
          imageUrls: existingDocument.imageUrls ?? [],
        });
  let processedOriginalImageUrls: string[] | undefined;
  if (existingOriginalImageUrls.length > 0) {
    processedOriginalImageUrls = await rehomeLocalUploadUrls({
      ledgerId,
      sourceDocumentId: newDocumentId,
      imageUrls: existingOriginalImageUrls.filter(
        (url): url is string => typeof url === "string" && url !== ""
      ),
    });
  } else if (originalImages != null && originalImages.length > 0) {
    processedOriginalImageUrls = await processImages(originalImages, ledgerId, newDocumentId);
  }

  await db.insert(sourceDocuments).values({
    id: newDocumentId,
    ledgerId,
    entryDate: existingDocument.entryDate,
    text,
    imageUrls: finalImageUrls,
    status: "queued",
    type: "ai_parsed",
    title: null,
    metadata:
      processedOriginalImageUrls != null && processedOriginalImageUrls.length > 0
        ? { originalImageUrls: processedOriginalImageUrls }
        : {},
  });

  logger.debug(
    { oldDocId: sourceDocumentId, newDocId: newDocumentId, ledgerId },
    "Created new source document for retry"
  );

  await db
    .update(sourceDocuments)
    .set({ deletedAt: new Date() })
    .where(q.whereId(sourceDocumentId));

  logger.debug(
    { oldDocId: sourceDocumentId, ledgerId },
    "Soft deleted old source document for retry"
  );

  const runningTasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.entityType, "source_document"),
      eq(taskRuns.entityId, sourceDocumentId),
      eq(taskRuns.scopeId, ledgerId),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  for (const task of runningTasks) {
    await cancelFlowTask(task.id);
  }

  await db
    .update(taskRuns)
    .set({ deletedAt: new Date() })
    .where(
      and(
        isNull(taskRuns.deletedAt),
        eq(taskRuns.entityType, "source_document"),
        eq(taskRuns.entityId, sourceDocumentId),
        eq(taskRuns.scopeId, ledgerId)
      )
    );

  const taskContext = await getSourceDocumentTaskContext(ledgerId, ledger);
  await prepareSourceDocumentTask({
    ledgerId,
    sourceDocumentId: newDocumentId,
    imageUrls: finalImageUrls,
    categories: taskContext.categories,
    settings: taskContext.settings,
    ...(text !== null && text !== undefined ? { text } : {}),
  });

  logger.debug(
    { newDocId: newDocumentId, ledgerId },
    "Submitted new parse task for retried document"
  );

  return {
    sourceDocumentId: newDocumentId,
    previousSourceDocumentId: sourceDocumentId,
    status: "queued",
  };
}

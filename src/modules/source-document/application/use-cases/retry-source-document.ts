import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  getSourceDocumentTaskContext,
  prepareSourceDocumentTask,
  processImages,
} from "../services/processing";
import { whereSourceDocumentNotDeletedId } from "../source-document-state";
import { rehomeLocalUploadUrls } from "../services/rehome-local-upload-urls";
import { sourceDocuments, type Ledger } from "@/persistence";
import {
  cancelActiveSourceDocumentTaskRuns,
  listRelatedSourceDocumentTaskRuns,
  softDeleteSourceDocumentsAndTaskRuns,
} from "../services/source-document-lifecycle";

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
  const existingDocument = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
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
  const imageUrlsToPersist =
    processedImageUrls != null && processedImageUrls.length > 0
      ? processedImageUrls
      : (existingDocument.imageUrls ?? []);
  const finalImageUrls = await rehomeLocalUploadUrls({
    ledgerId,
    sourceDocumentId: newDocumentId,
    imageUrls: imageUrlsToPersist,
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
    const processedProvidedOriginalImageUrls = await processImages(
      originalImages,
      ledgerId,
      newDocumentId
    );
    processedOriginalImageUrls = await rehomeLocalUploadUrls({
      ledgerId,
      sourceDocumentId: newDocumentId,
      imageUrls: processedProvidedOriginalImageUrls,
    });
  }

  await db.insert(sourceDocuments).values({
    id: newDocumentId,
    ledgerId,
    entryDate: input?.entryDate ?? existingDocument.entryDate,
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

  const relatedTaskRuns = await listRelatedSourceDocumentTaskRuns(ledgerId, [sourceDocumentId]);
  await cancelActiveSourceDocumentTaskRuns(relatedTaskRuns.map((task) => task.id));

  db.transaction((tx) => {
    softDeleteSourceDocumentsAndTaskRuns(
      tx,
      ledgerId,
      [sourceDocumentId],
      relatedTaskRuns.map((task) => task.id)
    );
  });

  logger.debug(
    { oldDocId: sourceDocumentId, ledgerId },
    "Soft deleted old source document for retry"
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

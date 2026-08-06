"use server";

import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import type { BatchActionResult } from "@/lib/batch-ids";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sourceDocumentIdsSchema } from "@/modules/source-document/contract-schemas";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingAfter } from "./schedule-processing";

const PROCESSING_UNAVAILABLE_CODES = new Set([
  "AI_JSON_REPAIR_FAILED",
  "AI_MODEL_CONFIG_REQUIRED",
  "CURRENCY_NOT_FOUND",
  "EXCHANGE_RATES_FETCH_FAILED",
  "EXCHANGE_RATES_UNAVAILABLE",
  "FILE_NOT_FOUND",
  "IMAGE_LOAD_FAILED",
  "LOCAL_STORAGE_DOWNLOAD_FAILED",
  "LOCAL_STORAGE_UPLOAD_FAILED",
  "OPENAI_API_KEY_MISSING",
  "OPENAI_INVALID_RESPONSE",
  "PROCESSING_UNAVAILABLE",
  "RATE_LIMIT",
  "REQUEST_ABORTED",
  "STORAGE_UNAVAILABLE",
  "TASK_RUNTIME_EDGE_UNSUPPORTED",
  "TASK_RUNTIME_NOT_INITIALIZED",
]);

function stableBatchFailureReason(
  error: unknown
): "not_available" | "conflict" | "processing_unavailable" | "internal" {
  if (error instanceof NotFoundError) return "not_available";
  if (error instanceof ConflictError) return "conflict";
  if (error instanceof AppError && PROCESSING_UNAVAILABLE_CODES.has(error.code)) {
    return "processing_unavailable";
  }
  return "internal";
}

function logBatchFailure(
  operation: "delete" | "retry",
  error: unknown,
  reason: "not_available" | "conflict" | "processing_unavailable" | "internal"
): void {
  logger.error(
    {
      error,
      reason,
      operation,
      correlationId: crypto.randomUUID(),
    },
    "Source document batch item failed"
  );
}

export const batchDeleteSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = sourceDocumentIdsSchema.parse(inputIds);
    const result: BatchActionResult = {
      requestedCount: ids.length,
      succeededIds: [],
      skipped: [],
      failed: [],
    };
    for (const id of ids) {
      try {
        const deleted = await deleteSourceDocument(
          { ledgerId, sourceDocumentId: id },
          serverComposition.sourceDocumentRevisions
        );
        if (deleted.deleted) result.succeededIds.push(id);
        else result.skipped.push({ id, reason: "not_available" });
      } catch (error) {
        const reason = stableBatchFailureReason(error);
        logBatchFailure("delete", error, reason);
        result.failed.push({
          id,
          reason,
        });
      }
    }
    return result;
  }
);

export const batchRetrySourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = sourceDocumentIdsSchema.parse(inputIds);
    const result: BatchActionResult = {
      requestedCount: ids.length,
      succeededIds: [],
      skipped: [],
      failed: [],
    };
    const intents: ProcessingIntentContract[] = [];
    for (const id of ids) {
      try {
        await retrySourceDocument(
          { ledgerId, sourceDocumentId: id },
          {
            submissions: serverComposition.sourceDocumentSubmissions,
            scheduleProcessing: (intent) => intents.push(intent),
          }
        );
        result.succeededIds.push(id);
      } catch (error) {
        const reason = stableBatchFailureReason(error);
        logBatchFailure("retry", error, reason);
        if (reason === "not_available" || reason === "conflict") {
          result.skipped.push({ id, reason });
        } else {
          result.failed.push({ id, reason });
        }
      }
    }
    for (const intent of intents) scheduleProcessingAfter(intent);
    return result;
  }
);

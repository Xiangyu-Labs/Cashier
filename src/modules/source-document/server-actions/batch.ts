"use server";

import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import type {
  PartialBatchCommandResult,
  VersionedTarget,
} from "@/modules/source-document/contracts";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { versionedTargetsSchema } from "@/modules/source-document/contract-schemas";
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

function stableBatchFailureCode(error: unknown): string {
  if (error instanceof AppError && PROCESSING_UNAVAILABLE_CODES.has(error.code)) {
    return "PROCESSING_UNAVAILABLE";
  }
  return error instanceof AppError ? error.code : "INTERNAL";
}

function logBatchFailure(operation: "delete" | "retry", error: unknown, code: string): void {
  logger.error(
    {
      error,
      code,
      operation,
      correlationId: crypto.randomUUID(),
    },
    "Source document batch item failed"
  );
}

export const batchDeleteSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputTargets: VersionedTarget[]): Promise<PartialBatchCommandResult> => {
    const targets = versionedTargetsSchema.parse(inputTargets);
    const result: PartialBatchCommandResult = {
      succeeded: [],
      stale: [],
      failed: [],
    };
    for (const target of targets) {
      const id = target.sourceDocumentId;
      try {
        const deleted = await serverComposition.sourceDocumentAggregate.deleteDocuments({
          ledgerId,
          target,
        });
        if (deleted.ok) {
          result.succeeded.push({ id, sourceDocumentId: id, version: deleted.version });
        } else {
          result.stale.push({
            id,
            sourceDocumentId: id,
            expectedVersion: deleted.expectedVersion,
            currentVersion: deleted.currentVersion,
          });
        }
      } catch (error) {
        const code = stableBatchFailureCode(error);
        logBatchFailure("delete", error, code);
        result.failed.push({ id, code });
      }
    }
    return result;
  }
);

export const batchRetrySourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputTargets: VersionedTarget[]): Promise<PartialBatchCommandResult> => {
    const targets = versionedTargetsSchema.parse(inputTargets);
    const result: PartialBatchCommandResult = {
      succeeded: [],
      stale: [],
      failed: [],
    };
    const intents: ProcessingIntentContract[] = [];
    for (const target of targets) {
      const id = target.sourceDocumentId;
      try {
        const retried = await retrySourceDocument(
          { ledgerId, sourceDocumentId: id, expectedVersion: target.expectedVersion },
          {
            submissions: {
              createPendingWithIntent: serverComposition.sourceDocumentAggregate.installRetry,
            },
            scheduleProcessing: (intent) => intents.push(intent),
          }
        );
        if (retried.ok) {
          result.succeeded.push({ id, sourceDocumentId: id, version: retried.version });
        } else {
          result.stale.push({
            id,
            sourceDocumentId: id,
            expectedVersion: retried.expectedVersion,
            currentVersion: retried.currentVersion,
          });
        }
      } catch (error) {
        const code = stableBatchFailureCode(error);
        logBatchFailure("retry", error, code);
        result.failed.push({ id, code });
      }
    }
    for (const intent of intents) scheduleProcessingAfter(intent);
    return result;
  }
);

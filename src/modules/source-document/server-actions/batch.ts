"use server";

import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import type { BatchActionResult } from "@/lib/batch-ids";
import { sourceDocumentIdsSchema } from "@/modules/source-document/contract-schemas";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

export const batchDeleteSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = sourceDocumentIdsSchema.parse(inputIds);
    const result: BatchActionResult = { requestedCount: ids.length, succeededIds: [], skipped: [], failed: [] };
    for (const id of ids) {
      try {
        const deleted = await deleteSourceDocument({ ledgerId, sourceDocumentId: id });
        if (deleted.deleted) result.succeededIds.push(id);
        else result.skipped.push({ id, reason: "not_available" });
      } catch (error) {
        result.failed.push({ id, reason: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return result;
  }
);

export const batchRetrySourceDocumentsAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = sourceDocumentIdsSchema.parse(inputIds);
    const result: BatchActionResult = { requestedCount: ids.length, succeededIds: [], skipped: [], failed: [] };
    const intents: ProcessingIntentContract[] = [];
    for (const id of ids) {
      try {
        await retrySourceDocument(
          { ledgerId, sourceDocumentId: id },
          {
            submissions: currentApplication.sourceDocumentSubmissions,
            scheduleProcessing: (intent) => intents.push(intent),
          }
        );
        result.succeededIds.push(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (/not found|deleted|unsupported|evidence/i.test(message)) result.skipped.push({ id, reason: message });
        else result.failed.push({ id, reason: message });
      }
    }
    if (intents.length > 0) after(async () => Promise.all(intents.map(executeSingleProcessingIntent)));
    return result;
  }
);

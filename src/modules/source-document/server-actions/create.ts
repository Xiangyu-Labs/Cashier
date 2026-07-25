"use server";
import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { currentApplication } from "@/application/current";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type {
  CreateSourceDocumentReconciliationDto,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecovery } from "./schedule-processing-recovery";
import { buildCreateReconciliation, readSourceDocumentUpdatedAt } from "./reconciliation";

/**
 * Create a new source document and trigger processing.
 *
 * Returns the existing DTO with additional reconciliation data for the
 * optimistic transaction system.
 */
export const createSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: CreateSourceDocumentInputContract,
    operationId?: string,
    clientSubmissionId?: string
  ): Promise<
    CreateSourceDocumentResponseDto &
      Partial<{ reconciliation: ReturnType<typeof buildCreateReconciliation> }>
  > => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const payload = omitUndefinedProperties(validated);

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      after(() => executeSingleProcessingIntent(intent));
    };

    const result = await createAndQueueSourceDocument(
      { ledgerId, ...payload },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        storedFiles: currentApplication.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    after(() => scheduleProcessingRecovery(ledgerId));

    if (operationId != null) {
      // Read authoritative updatedAt from DB (the row was just committed)
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(
        ledgerId,
        result.sourceDocumentId
      );
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      return {
        ...result,
        reconciliation: buildCreateReconciliation(
          operationId,
          clientSubmissionId,
          ledgerId,
          result.sourceDocumentId,
          payload.entryDate ?? null,
          now
        ),
      };
    }

    return result;
  }
);

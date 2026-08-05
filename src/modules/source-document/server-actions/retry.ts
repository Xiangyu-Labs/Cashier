"use server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type {
  RetrySourceDocumentReconciliationDto,
  RetrySourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import {
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { scheduleProcessingAfter } from "./schedule-processing";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { processImage } from "@/lib/storage/image-processing";

/**
 * Direct Retry: retry an existing source document with immutable evidence.
 *
 * Inherits the current evidence (text + files) and queues a new processing revision
 * immediately. This is a "re-parse with same input" action.
 *
 * Direct retry never accepts input overrides — it always inherits evidence.
 * For editing evidence before retry, use `editRetrySourceDocumentAction`.
 */
export const retrySourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    operationId?: string
  ): Promise<
    RetrySourceDocumentResponseDto &
      Partial<{ reconciliation: RetrySourceDocumentReconciliationDto["reconciliation"] }>
  > => {
    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await retrySourceDocument(
      { ledgerId, sourceDocumentId },
      {
        submissions: serverComposition.sourceDocumentSubmissions,
        storedFiles: serverComposition.storedFiles,
        processImage,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);

    if (operationId != null) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          operationId,
          ledgerId,
          sourceDocumentId
        ),
      };
    }

    return result;
  }
);

/**
 * Edit Retry: retry an existing source document with user-provided evidence overrides.
 *
 * Unlike direct retry, this accepts optional text/storedFileIds/entryDate overrides
 * and opens the prefilled edit dialog on the client. Processing is scheduled immediately.
 *
 * For a simple re-parse with no changes, use `retrySourceDocumentAction`.
 */
export const editRetrySourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    input?: RetrySourceDocumentInputContract,
    operationId?: string
  ): Promise<
    RetrySourceDocumentResponseDto &
      Partial<{ reconciliation: RetrySourceDocumentReconciliationDto["reconciliation"] }>
  > => {
    const validatedInput =
      input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await retrySourceDocument(
      {
        ledgerId,
        sourceDocumentId,
        ...(validatedInput == null ? {} : { input: validatedInput }),
      },
      {
        submissions: serverComposition.sourceDocumentSubmissions,
        storedFiles: serverComposition.storedFiles,
        processImage,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);

    if (operationId != null) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          operationId,
          ledgerId,
          sourceDocumentId
        ),
      };
    }

    return result;
  }
);

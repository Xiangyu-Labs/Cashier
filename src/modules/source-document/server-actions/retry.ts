"use server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type {
  RetrySourceDocumentResponseDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
import {
  versionedTargetSchema,
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { scheduleProcessingAfter } from "./schedule-processing";

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
    expectedVersion: number
  ): Promise<VersionedCommandResult<RetrySourceDocumentResponseDto>> => {
    const identity = versionedTargetSchema.parse({
      sourceDocumentId,
      expectedVersion,
    });
    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await retrySourceDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        expectedVersion: identity.expectedVersion,
      },
      {
        submissions: {
          createPendingWithIntent: serverComposition.sourceDocumentAggregate.installRetry,
        },
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);

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
    input: RetrySourceDocumentInputContract | undefined,
    expectedVersion: number
  ): Promise<VersionedCommandResult<RetrySourceDocumentResponseDto>> => {
    const identity = versionedTargetSchema.parse({
      sourceDocumentId,
      expectedVersion,
    });
    const validatedInput =
      input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await retrySourceDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        expectedVersion: identity.expectedVersion,
        ...(validatedInput == null ? {} : { input: validatedInput }),
      },
      {
        submissions: {
          createPendingWithIntent: serverComposition.sourceDocumentAggregate.installRetry,
        },
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);

    return result;
  }
);

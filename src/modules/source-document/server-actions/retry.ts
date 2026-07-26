"use server";
import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { currentApplication } from "@/application/current";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type {
  RetrySourceDocumentReconciliationDto,
  RetrySourceDocumentResponseDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import {
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecovery } from "./schedule-processing-recovery";
import { buildEntityReconciliation, readSourceDocumentUpdatedAt } from "./reconciliation";

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
      after(() => executeSingleProcessingIntent(intent));
    };

    const result = await retrySourceDocument(
      { ledgerId, sourceDocumentId },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    after(() => scheduleProcessingRecovery(ledgerId));

    if (operationId != null) {
      // Read authoritative updatedAt from DB
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(
        ledgerId,
        sourceDocumentId
      );
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        {
          id: sourceDocumentId,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "processing",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as SourceDocumentListItemDto,
        now,
        true,
        true
      );
      return { ...result, reconciliation: entity };
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
      after(() => executeSingleProcessingIntent(intent));
    };

    const result = await retrySourceDocument(
      {
        ledgerId,
        sourceDocumentId,
        ...(validatedInput == null ? {} : { input: validatedInput }),
      },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    after(() => scheduleProcessingRecovery(ledgerId));

    if (operationId != null) {
      // Read authoritative updatedAt from DB
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(
        ledgerId,
        sourceDocumentId
      );
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        {
          id: sourceDocumentId,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "processing",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as SourceDocumentListItemDto,
        now,
        true,
        true
      );
      return { ...result, reconciliation: entity };
    }

    return result;
  }
);

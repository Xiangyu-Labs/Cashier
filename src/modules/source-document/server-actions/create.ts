"use server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { scheduleProcessingAfter } from "./schedule-processing";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { scheduleRequestMaintenance } from "@/lib/tasks/request-maintenance";

/**
 * Create a new source document and trigger processing.
 *
 * Returns the existing DTO with additional reconciliation data for the
 * optimistic transaction system.
 */
export const createSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, ledger },
    input: CreateSourceDocumentInputContract,
    operationId?: string,
    clientSubmissionId?: string
  ): Promise<
    CreateSourceDocumentResponseDto &
      Partial<{ reconciliation: Awaited<ReturnType<typeof buildAuthoritativeReconciliation>> }>
  > => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const payload = omitUndefinedProperties(validated);

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await createAndQueueSourceDocument(
      { ledgerId, ledger, ...payload },
      {
        submissions: serverComposition.sourceDocumentSubmissions,
        storedFiles: serverComposition.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);
    scheduleRequestMaintenance();

    if (operationId != null) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          operationId,
          ledgerId,
          result.sourceDocumentId,
          clientSubmissionId
        ),
      };
    }

    return result;
  }
);

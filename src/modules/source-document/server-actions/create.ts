"use server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  parseOperationIdentity,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { scheduleProcessingAfter } from "./schedule-processing";
import { scheduleRequestMaintenance } from "@/application/transport/request-maintenance";
import { sourceDocumentFingerprint } from "@/modules/source-document/source-document-fingerprint";

/**
 * Create a new source document and trigger processing.
 */
export const createSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, ledger, userId },
    input: CreateSourceDocumentInputContract,
    _operationId?: string,
    clientSubmissionId?: string
  ): Promise<CreateSourceDocumentResponseDto> => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const payload = omitUndefinedProperties(validated);
    const submissionIdentity = parseOperationIdentity({
      ...(clientSubmissionId === undefined ? {} : { operationId: clientSubmissionId }),
    });

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await createAndQueueSourceDocument(
      {
        ledgerId,
        ledger,
        ...payload,
        ...(submissionIdentity.operationId == null
          ? {}
          : {
              idempotency: {
                principalType: "user" as const,
                principalId: userId,
                key: `source-document:create:${ledgerId}:new:${submissionIdentity.operationId}`,
                contentFingerprint: sourceDocumentFingerprint(payload),
              },
            }),
      },
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

    return result;
  }
);

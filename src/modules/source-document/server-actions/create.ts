"use server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  clientSubmissionIdSchema,
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
    clientSubmissionId: string
  ): Promise<CreateSourceDocumentResponseDto> => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const validatedClientSubmissionId = clientSubmissionIdSchema.parse(clientSubmissionId);
    const payload = omitUndefinedProperties(validated);
    const timezone = payload.timezone ?? ledger.settings.timeZone ?? undefined;
    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      scheduleProcessingAfter(intent);
    };

    const result = await createAndQueueSourceDocument(
      {
        ledgerId,
        evidence: {
          kind: "stored",
          ...(payload.text == null ? {} : { text: payload.text }),
          storedFileIds: payload.storedFileIds ?? [],
        },
        ...(payload.entryDate == null ? {} : { entryDate: payload.entryDate }),
        ...(timezone === undefined ? {} : { timezone }),
        idempotency: {
          principalType: "user",
          principalId: userId,
          key: `source-document:create:${ledgerId}:new:${validatedClientSubmissionId}`,
          contentFingerprint: sourceDocumentFingerprint(payload),
        },
      },
      {
        submissions: {
          createPendingWithIntent:
            serverComposition.sourceDocumentAggregate.createProcessingDocument,
          createIdempotentPendingWithIntent:
            serverComposition.sourceDocumentAggregate.createIdempotentProcessingDocument,
        },
        storedFiles: serverComposition.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );

    // Also recover any missed processing intents
    scheduleProcessingRecoveryAfter(ledgerId);
    scheduleRequestMaintenance();

    return { sourceDocumentId: result.sourceDocumentId, version: 1, status: "processing" };
  }
);

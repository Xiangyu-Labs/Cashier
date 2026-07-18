"use server";
import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { currentApplication } from "@/application/current";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

export const maxDuration = 120;

/**
 * Create a new source document and trigger processing
 */
export const createSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: CreateSourceDocumentInputContract
  ): Promise<CreateSourceDocumentResponseDto> => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const payload = omitUndefinedProperties(validated);

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      after(() => executeSingleProcessingIntent(intent));
    };

    return createAndQueueSourceDocument(
      { ledgerId, ...payload },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        storedFiles: currentApplication.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );
  }
);

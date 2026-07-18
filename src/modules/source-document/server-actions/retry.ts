"use server";
import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { currentApplication } from "@/application/current";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { withSourceDocumentLedgerAccess } from "./access";

export const maxDuration = 120;

/**
 * Retry an existing source document with optional new data
 *
 * Every retry queues a new immutable revision under the stable document identity.
 */
export const retrySourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    input?: RetrySourceDocumentInputContract
  ): Promise<RetrySourceDocumentResponseDto> => {
    const validatedInput =
      input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));

    const scheduleProcessing = (intent: ProcessingIntentContract) => {
      after(() => executeSingleProcessingIntent(intent));
    };

    return retrySourceDocument(
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
  }
);

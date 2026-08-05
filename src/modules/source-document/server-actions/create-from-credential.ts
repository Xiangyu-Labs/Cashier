"use server";

import type { ProcessingIntentContract } from "@/application/contracts";
import { ValidationError } from "@/lib/errors";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { preparedApiV1SourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";
import { serverComposition } from "@/application/server-composition-root";
import { scheduleProcessingAfter } from "./schedule-processing";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { scheduleRequestMaintenance } from "@/lib/tasks/request-maintenance";

export async function createSourceDocumentFromCredentialAction(input: {
  credentialId: string;
  ledgerId: string;
  idempotencyKey?: string;
  requestId?: string;
  payload: unknown;
}): Promise<CreateSourceDocumentResponseDto> {
  const parsed = preparedApiV1SourceDocumentInputSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  const scheduleProcessing = (intent: ProcessingIntentContract) => {
    scheduleProcessingAfter(intent, input.requestId);
  };

  const result = await createSourceDocumentFromCredential(
    {
      credentialId: input.credentialId,
      ledgerId: input.ledgerId,
      ...(input.idempotencyKey == null ? {} : { idempotencyKey: input.idempotencyKey }),
      payload: {
        images: parsed.data.images,
        ...(parsed.data.entryDate == null ? {} : { entryDate: parsed.data.entryDate }),
      },
    },
    scheduleProcessing,
    {
      ledgers: serverComposition.ledgers,
      settings: serverComposition.settings,
      submissions: serverComposition.sourceDocumentSubmissions,
      storedFiles: serverComposition.storedFiles,
    }
  );

  // Also recover older pending intents for the ledger and run bounded
  // maintenance. The claim CAS makes duplicate scheduling harmless.
  scheduleProcessingRecoveryAfter(input.ledgerId, input.requestId);
  scheduleRequestMaintenance();

  return result;
}

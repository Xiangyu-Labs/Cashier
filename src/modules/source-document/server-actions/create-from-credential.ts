"use server";

import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { ValidationError } from "@/lib/errors";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { preparedApiV1SourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";
import { serverComposition } from "@/application/server-composition-root";

export async function createSourceDocumentFromCredentialAction(input: {
  credentialId: string;
  ledgerId: string;
  idempotencyKey?: string;
  payload: unknown;
}): Promise<CreateSourceDocumentResponseDto> {
  const parsed = preparedApiV1SourceDocumentInputSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  const scheduleProcessing = (intent: ProcessingIntentContract) => {
    after(() => executeSingleProcessingIntent(intent));
  };

  return createSourceDocumentFromCredential(
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
}

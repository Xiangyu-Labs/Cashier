"use server";

import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { ValidationError } from "@/lib/errors";
import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { createSourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";

export const maxDuration = 120;

export async function createSourceDocumentFromCredentialAction(input: {
  credentialId: string;
  ledgerId: string;
  idempotencyKey?: string;
  payload: unknown;
}): Promise<CreateSourceDocumentResponseDto> {
  const parsed = createSourceDocumentInputSchema.safeParse(input.payload);
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
      payload: parsed.data as CreateSourceDocumentInput,
    },
    scheduleProcessing
  );
}

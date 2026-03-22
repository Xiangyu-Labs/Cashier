"use server";

import { ValidationError } from "@/lib/errors";
import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { createSourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";

export async function createSourceDocumentFromCredentialAction(input: {
  credentialId: string;
  payload: unknown;
}): Promise<CreateSourceDocumentResponseDto> {
  const parsed = createSourceDocumentInputSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  return createSourceDocumentFromCredential({
    credentialId: input.credentialId,
    payload: parsed.data as CreateSourceDocumentInput,
  });
}

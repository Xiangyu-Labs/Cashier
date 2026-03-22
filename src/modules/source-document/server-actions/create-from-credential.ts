"use server";

import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";

export async function createSourceDocumentFromCredentialApiAction(input: {
  credentialId: string;
  payload: CreateSourceDocumentInput;
}): Promise<CreateSourceDocumentResponseDto> {
  return createSourceDocumentFromCredential(input);
}

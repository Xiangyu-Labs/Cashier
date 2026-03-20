import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/credential-access";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

export async function createSourceDocumentFromCredential(input: {
  credentialId: string;
  payload: CreateSourceDocumentInput;
}): Promise<CreateSourceDocumentResponseDto> {
  const ledger = await resolveLedgerForServiceCredential(input.credentialId);

  if (ledger == null) {
    throw new ValidationError("Service credential or ledger not found");
  }

  const payload = omitUndefinedProperties(input.payload);

  return createAndQueueSourceDocument({
    ledgerId: ledger.id,
    ledger,
    ...payload,
  });
}

import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { getLedgerForServiceCredential } from "@/modules/ledger/queries";
import { ValidationError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

export async function createSourceDocumentFromCredential(input: {
  credentialId: string;
  payload: CreateSourceDocumentInput;
}): Promise<CreateSourceDocumentResponseDto> {
  const ledger = await getLedgerForServiceCredential(input.credentialId);

  if (ledger == null) {
    throw new ValidationError("Service credential or ledger not found");
  }

  return createAndQueueSourceDocument({
    ledgerId: ledger.id,
    ledger,
    text: input.payload.text,
    images: input.payload.images,
    originalImages: input.payload.originalImages,
    entryDate: input.payload.entryDate,
    timezone: input.payload.timezone,
  });
}

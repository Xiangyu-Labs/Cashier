import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { omitUndefinedProperties } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";
import type { IdempotencyPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/credential-access";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

export async function createSourceDocumentFromCredential(input: {
  credentialId: string;
  ledgerId?: string;
  idempotencyKey?: string;
  payload: CreateSourceDocumentInput;
}, dependencies: { idempotency: IdempotencyPort } = currentApplication): Promise<CreateSourceDocumentResponseDto> {

  const payload = omitUndefinedProperties(input.payload);
  const ledger =
    input.ledgerId == null
      ? await resolveLedgerForServiceCredential(input.credentialId)
      : { id: input.ledgerId };
  if (ledger == null) throw new ValidationError("Service credential or ledger not found");

  const create = () =>
    createAndQueueSourceDocument({ ledgerId: ledger.id, ledger, ...payload });
  if (input.idempotencyKey == null) return create();
  const key = `api-v1:${input.credentialId}:${input.idempotencyKey}`;
  return dependencies.idempotency.execute(key, create);
}

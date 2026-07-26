import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { omitUndefinedProperties } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";
import type { IdempotencyPort, ProcessingIntentContract } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/credential-access";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

/** API v1 max decoded bytes per file (narrower than the Web policy). */
const API_V1_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;

export async function createSourceDocumentFromCredential(
  input: {
    credentialId: string;
    ledgerId?: string;
    idempotencyKey?: string;
    payload: CreateSourceDocumentInput;
  },
  scheduleProcessing: (intent: ProcessingIntentContract) => void,
  dependencies: { idempotency: IdempotencyPort } = currentApplication
): Promise<CreateSourceDocumentResponseDto> {
  const payload = omitUndefinedProperties(input.payload);
  const ledger =
    input.ledgerId == null
      ? await resolveLedgerForServiceCredential(input.credentialId)
      : { id: input.ledgerId };
  if (ledger == null) throw new ValidationError("Service credential or ledger not found");

  const create = () =>
    createAndQueueSourceDocument(
      { ledgerId: ledger.id, ledger, ...payload, maxDecodedImageBytes: API_V1_MAX_ORIGINAL_BYTES },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        storedFiles: currentApplication.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );
  if (input.idempotencyKey == null) return create();
  const key = `api-v1:${input.credentialId}:${input.idempotencyKey}`;
  return dependencies.idempotency.execute(key, create);
}

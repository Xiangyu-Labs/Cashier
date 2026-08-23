import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { ProcessingIntentContract } from "@/application/contracts";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/credential-access";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";
import { createHash } from "crypto";
import { API_V1_MAX_DECODED_IMAGE_BYTES } from "@/modules/source-document/api-v1-policy";
import type { PreparedApiV1SourceDocumentInput } from "@/modules/source-document/api-v1-policy";
import type { SourceDocumentCredentialPorts } from "../ports";

function contentFingerprint(payload: PreparedApiV1SourceDocumentInput): string {
  const hash = createHash("sha256");
  hash.update("cashier-api-v1\0");
  hash.update(
    JSON.stringify({
      text: null,
      entryDate: payload.entryDate ?? null,
      timezone: null,
      storedFileIds: [],
      images: payload.images.map((image) => ({
        mimeType: image.mimeType,
        contentHash: image.contentHash,
      })),
      originalImages: [],
    })
  );
  return hash.digest("hex");
}

export async function createSourceDocumentFromCredential(
  input: {
    credentialId: string;
    ledgerId?: string;
    idempotencyKey?: string;
    payload: PreparedApiV1SourceDocumentInput;
  },
  scheduleProcessing: (intent: ProcessingIntentContract) => void,
  ports: SourceDocumentCredentialPorts
): Promise<CreateSourceDocumentResponseDto> {
  const authenticatedLedger = await resolveLedgerForServiceCredential(
    input.credentialId,
    ports.ledgers
  );
  if (
    authenticatedLedger != null &&
    input.ledgerId != null &&
    authenticatedLedger.id !== input.ledgerId
  ) {
    throw new ForbiddenError("Service credential does not belong to the requested ledger");
  }
  const ledger = authenticatedLedger;
  if (ledger == null) throw new ValidationError("Service credential or ledger not found");

  const payload = input.payload;
  const images = payload.images ?? [];
  return createAndQueueSourceDocument(
    {
      ledgerId: ledger.id,
      ledger,
      preparedImages: images,
      ...(payload.entryDate == null ? {} : { entryDate: payload.entryDate }),
      maxDecodedImageBytes: API_V1_MAX_DECODED_IMAGE_BYTES,
      ...(input.idempotencyKey == null
        ? {}
        : {
            idempotency: {
              principalType: "credential",
              principalId: input.credentialId,
              key: input.idempotencyKey,
              contentFingerprint: contentFingerprint(payload),
            },
          }),
    },
    {
      submissions: ports.submissions,
      storedFiles: ports.storedFiles,
      processImage: processImageFn,
      scheduleProcessing,
    }
  );
}

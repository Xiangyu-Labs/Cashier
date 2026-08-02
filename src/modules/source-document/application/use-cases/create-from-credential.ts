import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { omitUndefinedProperties } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";
import type { ProcessingIntentContract } from "@/application/contracts";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/credential-access";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";
import { createHash } from "crypto";
import { decodeBase64Image } from "@/modules/source-document/base64-image";
import {
  API_V1_MAX_DECODED_BATCH_BYTES,
  API_V1_MAX_DECODED_IMAGE_BYTES,
} from "@/app/api/v1/_shared/limits";
import type { SourceDocumentCredentialPorts } from "../ports";

function contentFingerprint(payload: CreateSourceDocumentInput): string {
  const hash = createHash("sha256");
  hash.update("cashier-api-v1\0");
  const normalizeImages = (images: readonly { data: string; mimeType: string }[] | undefined) =>
    images?.map((image) => ({
      mimeType: image.mimeType.toLowerCase(),
      contentHash: createHash("sha256")
        .update(decodeBase64Image(image.data, image.mimeType).bytes)
        .digest("hex"),
    })) ?? [];
  hash.update(
    JSON.stringify({
      text: payload.text ?? null,
      entryDate: payload.entryDate ?? null,
      timezone: payload.timezone ?? null,
      storedFileIds: payload.storedFileIds ?? [],
      images: normalizeImages(payload.images),
      originalImages: normalizeImages(payload.originalImages),
    })
  );
  return hash.digest("hex");
}

export async function createSourceDocumentFromCredential(
  input: {
    credentialId: string;
    ledgerId?: string;
    idempotencyKey?: string;
    payload: CreateSourceDocumentInput;
  },
  scheduleProcessing: (intent: ProcessingIntentContract) => void,
  ports: SourceDocumentCredentialPorts
): Promise<CreateSourceDocumentResponseDto> {
  const payload = omitUndefinedProperties(input.payload);
  const ledger =
    input.ledgerId == null
      ? await resolveLedgerForServiceCredential(input.credentialId, ports.ledgers)
      : {
          id: input.ledgerId,
          settings: (await ports.settings.get(input.ledgerId)) ?? {},
        };
  if (ledger == null) throw new ValidationError("Service credential or ledger not found");

  const images = payload.images ?? [];
  const totalBytes = images.reduce(
    (total, image) => total + decodeBase64Image(image.data, image.mimeType).bytes.length,
    0
  );
  if (totalBytes > API_V1_MAX_DECODED_BATCH_BYTES) {
    throw new ValidationError("Decoded image batch exceeds 3 MiB");
  }
  return createAndQueueSourceDocument(
    {
      ledgerId: ledger.id,
      ledger,
      ...payload,
      maxDecodedImageBytes: API_V1_MAX_DECODED_IMAGE_BYTES,
      ...(input.idempotencyKey == null
        ? {}
        : {
            idempotency: {
              credentialId: input.credentialId,
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

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
import { createHash } from "crypto";
import { decodeBase64Image } from "@/modules/source-document/base64-image";
import {
  API_V1_MAX_DECODED_BATCH_BYTES,
  API_V1_MAX_DECODED_IMAGE_BYTES,
} from "@/app/api/v1/_shared/limits";

function contentFingerprint(images: readonly { data: string; mimeType: string }[]): string {
  const hash = createHash("sha256");
  hash.update("cashier-api-v1\0");
  for (const image of images) {
    const bytes = decodeBase64Image(image.data, image.mimeType).bytes;
    hash.update(createHash("sha256").update(bytes).digest());
  }
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
  dependencies: { idempotency: IdempotencyPort } = currentApplication
): Promise<CreateSourceDocumentResponseDto> {
  const payload = omitUndefinedProperties(input.payload);
  const ledger =
    input.ledgerId == null
      ? await resolveLedgerForServiceCredential(input.credentialId)
      : {
          id: input.ledgerId,
          settings: (await currentApplication.settings.get(input.ledgerId)) ?? {},
        };
  if (ledger == null) throw new ValidationError("Service credential or ledger not found");

  const create = () =>
    createAndQueueSourceDocument(
      {
        ledgerId: ledger.id,
        ledger,
        ...payload,
        maxDecodedImageBytes: API_V1_MAX_DECODED_IMAGE_BYTES,
      },
      {
        submissions: currentApplication.sourceDocumentSubmissions,
        storedFiles: currentApplication.storedFiles,
        processImage: processImageFn,
        scheduleProcessing,
      }
    );
  if (input.idempotencyKey == null) return create();
  const images = payload.images ?? [];
  const totalBytes = images.reduce(
    (total, image) => total + decodeBase64Image(image.data, image.mimeType).bytes.length,
    0
  );
  if (totalBytes > API_V1_MAX_DECODED_BATCH_BYTES) {
    throw new ValidationError("Decoded image batch exceeds 3 MiB");
  }
  return dependencies.idempotency.execute(
    input.credentialId,
    input.idempotencyKey,
    create,
    contentFingerprint(images)
  );
}

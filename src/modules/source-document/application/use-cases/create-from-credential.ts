import type {
  AuthenticatedServiceCredentialContract,
  ProcessingIntentContract,
  SourceDocumentSubmissionContract,
} from "@/application/contracts";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";
import { createHash } from "crypto";
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
    credential: AuthenticatedServiceCredentialContract;
    idempotencyKey?: string;
    payload: PreparedApiV1SourceDocumentInput;
  },
  scheduleProcessing: (intent: ProcessingIntentContract) => void,
  ports: SourceDocumentCredentialPorts
): Promise<SourceDocumentSubmissionContract> {
  const payload = input.payload;
  return createAndQueueSourceDocument(
    {
      ledgerId: input.credential.ledgerId,
      evidence: { kind: "inline", images: payload.images },
      ...(payload.entryDate == null ? {} : { entryDate: payload.entryDate }),
      ...(input.idempotencyKey == null
        ? {}
        : {
            idempotency: {
              principalType: "credential",
              principalId: input.credential.id,
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

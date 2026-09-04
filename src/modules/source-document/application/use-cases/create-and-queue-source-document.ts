import { ValidationError } from "@/lib/errors";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { omitUndefinedProperties } from "@/lib/validation";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
import { parseSourceDocumentPayloadInput } from "@/modules/source-document/contract-schemas";
import { validateAggregateFileCount } from "@/lib/storage/upload-policy";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { API_V1_MAX_DECODED_BATCH_BYTES } from "@/modules/source-document/api-v1-policy";
import type { PreparedInlineImage } from "@/modules/source-document/api-v1-policy";
import { prepareInlineImages, type InlineImageSource } from "./prepare-inline-images";
import type { InlineImageUploader } from "./prepare-inline-images";

export interface CreateAndQueueSourceDocumentInput {
  ledgerId: string;
  ledger?: unknown;
  text?: string;
  storedFileIds?: string[];
  images?: Array<{ data: string; mimeType: string }>;
  originalImages?: Array<{ data: string; mimeType: string }>;
  /** Internal API v1 path: images already decoded and validated once. */
  preparedImages?: PreparedInlineImage[];
  maxDecodedImageBytes?: number;
  entryDate?: string;
  timezone?: string;
  idempotency?: {
    principalType: "credential" | "user";
    principalId: string;
    key: string;
    contentFingerprint: string | null;
  };
}

interface CreateAndQueueSourceDocumentDependencies {
  submissions: SourceDocumentSubmissionPort;
  storedFiles: InlineImageUploader;
  processImage: typeof processImageFn;
  scheduleProcessing: (intent: ProcessingIntentContract) => void;
}

function resolveEntryDate(entryDate?: string, timezone?: string): string {
  if (entryDate != null && entryDate !== "") return entryDate;
  return getDateInTimezone(timezone) ?? formatDateTimeForApi(new Date());
}

function readLedgerTimeZone(ledger: unknown): string | undefined {
  if (typeof ledger !== "object" || ledger == null) return undefined;
  const value = ledger as {
    settings?: { timeZone?: unknown };
  };
  const timeZone = value.settings?.timeZone;
  return typeof timeZone === "string" && timeZone !== "" ? timeZone : undefined;
}

export async function createAndQueueSourceDocument(
  input: CreateAndQueueSourceDocumentInput,
  dependencies: CreateAndQueueSourceDocumentDependencies
): Promise<SourceDocumentSubmissionContract> {
  let createdUploadSessionId: string | null = null;
  const hasPreparedImages = input.preparedImages != null && input.preparedImages.length > 0;

  const validated = parseSourceDocumentPayloadInput(
    omitUndefinedProperties({
      text: input.text,
      storedFileIds: input.storedFileIds,
      images: hasPreparedImages ? undefined : input.images,
      originalImages: input.originalImages,
      entryDate: input.entryDate,
      timezone: input.timezone,
    })
  );

  // Process inline images - decode, process, upload, finalize
  const imagesToProcess: InlineImageSource[] = hasPreparedImages
    ? input.preparedImages!
    : (validated.images ?? []);
  const originalImagesToProcess = validated.originalImages ?? [];
  validateAggregateFileCount(
    (validated.storedFileIds?.length ?? 0) + imagesToProcess.length,
    originalImagesToProcess.length
  );

  if (originalImagesToProcess.length > 0) {
    throw new ValidationError("Images must be finalized before source-document submission");
  }

  if (
    (validated.text == null || validated.text === "") &&
    (validated.storedFileIds == null || validated.storedFileIds.length === 0) &&
    imagesToProcess.length === 0
  ) {
    throw new ValidationError("Content (text or images) is required");
  }

  if (hasPreparedImages) {
    const totalDecodedBytes = input.preparedImages!.reduce(
      (total, image) => total + image.bytes.length,
      0
    );
    if (totalDecodedBytes > API_V1_MAX_DECODED_BATCH_BYTES) {
      throw new ValidationError("Decoded image batch exceeds 3 MiB");
    }
  }

  const prepareSubmission = async () => {
    const preparedImages =
      imagesToProcess.length > 0
        ? await prepareInlineImages(
            imagesToProcess,
            dependencies.storedFiles,
            dependencies.processImage,
            input.ledgerId,
            input.maxDecodedImageBytes
          )
        : null;
    createdUploadSessionId = preparedImages?.uploadSessionId ?? null;
    const processedImageIds = preparedImages?.storedFileIds ?? [];

    const totalFileCount = (validated.storedFileIds?.length ?? 0) + processedImageIds.length;
    validateAggregateFileCount(totalFileCount, 0);

    return {
      ledgerId: input.ledgerId,
      submittedText: validated.text ?? null,
      storedFileIds: [...(validated.storedFileIds ?? []), ...processedImageIds],
      entryDate: resolveEntryDate(
        validated.entryDate,
        validated.timezone ?? readLedgerTimeZone(input.ledger)
      ),
    };
  };

  let pending;
  try {
    pending =
      input.idempotency != null &&
      dependencies.submissions.createIdempotentPendingWithIntent != null
        ? await dependencies.submissions.createIdempotentPendingWithIntent(
            input.idempotency,
            prepareSubmission
          )
        : await dependencies.submissions.createPendingWithIntent(await prepareSubmission());
  } catch (error) {
    if (createdUploadSessionId != null) {
      try {
        await dependencies.storedFiles.abandonUploadSession(input.ledgerId, createdUploadSessionId);
      } catch {
        // prepareInlineImages already records cleanup diagnostics; preserve the submission error.
      }
    }
    throw error;
  }
  if (pending.idempotencyReplay !== true) dependencies.scheduleProcessing(pending.intent);
  return toSourceDocumentSubmissionContract(pending.document, pending.revision);
}

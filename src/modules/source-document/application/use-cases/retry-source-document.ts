import { ValidationError } from "@/lib/errors";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  prepareInlineImages,
  type ImageProcessor,
  type InlineImageUploader,
} from "./prepare-inline-images";

interface SourceDocumentRetryPayload {
  text?: string;
  storedFileIds?: string[];
  images?: { data: string; mimeType: string }[];
  originalImages?: { data: string; mimeType: string }[];
  entryDate?: string;
}

interface RetrySourceDocumentInput {
  ledgerId: string;
  ledger?: unknown;
  sourceDocumentId: string;
  idempotency?: {
    principalType: "credential" | "user";
    principalId: string;
    key: string;
    contentFingerprint: string | null;
  };
  input?: SourceDocumentRetryPayload;
}

interface RetrySourceDocumentDependencies {
  submissions: SourceDocumentSubmissionPort;
  scheduleProcessing: (intent: ProcessingIntentContract) => void;
  storedFiles?: InlineImageUploader;
  processImage?: ImageProcessor;
}

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, input, idempotency }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
): Promise<RetrySourceDocumentResponseDto> {
  let createdUploadSessionId: string | null = null;
  if ((input?.originalImages?.length ?? 0) > 0) {
    throw new ValidationError("Images must be finalized before source-document retry");
  }
  const inlineImages = input?.images ?? [];
  if (
    inlineImages.length > 0 &&
    (dependencies.storedFiles == null || dependencies.processImage == null)
  ) {
    throw new ValidationError("Images must be finalized before source-document retry");
  }
  const prepareSubmission = async () => {
    const preparedImages =
      inlineImages.length === 0
        ? null
        : await prepareInlineImages(
            inlineImages,
            dependencies.storedFiles!,
            dependencies.processImage!,
            ledgerId,
            3 * 1024 * 1024
          );
    createdUploadSessionId = preparedImages?.uploadSessionId ?? null;
    const inlineFileIds = preparedImages?.storedFileIds ?? [];
    const storedFileIds =
      input?.storedFileIds == null && inlineFileIds.length === 0
        ? undefined
        : [...(input?.storedFileIds ?? []), ...inlineFileIds];

    return {
      ledgerId,
      sourceDocumentId,
      inheritEvidence: true,
      supersedeProcessing: true,
      ...(input?.text === undefined ? {} : { submittedText: input.text }),
      ...(storedFileIds === undefined ? {} : { storedFileIds }),
      ...(input?.entryDate === undefined ? {} : { entryDate: input.entryDate }),
    };
  };

  let pending;
  try {
    pending =
      idempotency != null && dependencies.submissions.createIdempotentPendingWithIntent != null
        ? await dependencies.submissions.createIdempotentPendingWithIntent(
            idempotency,
            prepareSubmission
          )
        : await dependencies.submissions.createPendingWithIntent(await prepareSubmission());
  } catch (error) {
    if (createdUploadSessionId != null) {
      try {
        await dependencies.storedFiles?.abandonUploadSession(ledgerId, createdUploadSessionId);
      } catch {
        // Preserve the submission error; upload cleanup is best-effort.
      }
    }
    throw error;
  }
  if (pending.idempotencyReplay !== true) dependencies.scheduleProcessing(pending.intent);

  return {
    sourceDocumentId: pending.document.id,
    previousSourceDocumentId: sourceDocumentId,
    status: "processing",
  };
}

import { StaleSourceDocumentVersionError, ValidationError } from "@/lib/errors";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type {
  RetrySourceDocumentResponseDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
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
  expectedVersion?: number;
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

export function retrySourceDocument(
  input: RetrySourceDocumentInput & { expectedVersion: number },
  dependencies: RetrySourceDocumentDependencies
): Promise<VersionedCommandResult<RetrySourceDocumentResponseDto>>;
export function retrySourceDocument(
  input: RetrySourceDocumentInput & { expectedVersion?: undefined },
  dependencies: RetrySourceDocumentDependencies
): Promise<RetrySourceDocumentResponseDto>;
export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, expectedVersion, input, idempotency }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
): Promise<
  RetrySourceDocumentResponseDto | VersionedCommandResult<RetrySourceDocumentResponseDto>
> {
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
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
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
    if (error instanceof StaleSourceDocumentVersionError && expectedVersion !== undefined) {
      return {
        ok: false,
        reason: "stale",
        sourceDocumentId: error.sourceDocumentId,
        expectedVersion: error.expectedVersion,
        currentVersion: error.currentVersion,
      };
    }
    throw error;
  }
  if (pending.idempotencyReplay !== true) dependencies.scheduleProcessing(pending.intent);

  const data = { status: "processing" as const };
  return expectedVersion === undefined
    ? data
    : {
        ok: true,
        sourceDocumentId,
        version: pending.document.version,
        data,
      };
}

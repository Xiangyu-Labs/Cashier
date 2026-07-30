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
  input?: SourceDocumentRetryPayload;
}

interface RetrySourceDocumentDependencies {
  submissions: SourceDocumentSubmissionPort;
  scheduleProcessing: (intent: ProcessingIntentContract) => void;
  storedFiles?: InlineImageUploader;
  processImage?: ImageProcessor;
}

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, input }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
): Promise<RetrySourceDocumentResponseDto> {
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
  const inlineFileIds =
    inlineImages.length === 0
      ? []
      : await prepareInlineImages(
          inlineImages,
          dependencies.storedFiles!,
          dependencies.processImage!,
          ledgerId,
          3 * 1024 * 1024
        );
  const storedFileIds =
    input?.storedFileIds == null && inlineFileIds.length === 0
      ? undefined
      : [...(input?.storedFileIds ?? []), ...inlineFileIds];

  const pending = await dependencies.submissions.createPendingWithIntent({
    ledgerId,
    sourceDocumentId,
    inheritEvidence: true,
    supersedeProcessing: true,
    ...(input?.text === undefined ? {} : { submittedText: input.text }),
    ...(storedFileIds === undefined ? {} : { storedFileIds }),
    ...(input?.entryDate === undefined ? {} : { entryDate: input.entryDate }),
  });
  dependencies.scheduleProcessing(pending.intent);

  return {
    sourceDocumentId: pending.document.id,
    previousSourceDocumentId: sourceDocumentId,
    status: "processing",
  };
}

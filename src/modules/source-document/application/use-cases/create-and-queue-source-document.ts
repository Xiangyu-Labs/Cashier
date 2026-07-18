import { ValidationError } from "@/lib/errors";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { omitUndefinedProperties } from "@/lib/validation";
import type { SourceDocumentSubmissionPort } from "@/application/contracts";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { parseCreateSourceDocumentInput } from "@/modules/source-document/contract-schemas";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { prepareInlineImages } from "./prepare-inline-images";
import type { InlineImageUploader } from "./prepare-inline-images";

export interface CreateAndQueueSourceDocumentInput {
  ledgerId: string;
  /** Retained input compatibility; target submission does not inspect persistence rows. */
  ledger?: unknown;
  text?: string;
  storedFileIds?: string[];
  images?: Array<{ data: string; mimeType: string }>;
  originalImages?: Array<{ data: string; mimeType: string }>;
  entryDate?: string;
  timezone?: string;
}

interface CreateAndQueueSourceDocumentDependencies {
  submissions: SourceDocumentSubmissionPort;
  storedFiles: InlineImageUploader;
  processImage: typeof processImageFn;
  triggerProcessing: (intent: Parameters<typeof currentApplication.triggerRevisionProcessingIntent>[0]) => void;
}

const defaultDependencies: CreateAndQueueSourceDocumentDependencies = {
  submissions: currentApplication.sourceDocumentSubmissions,
  storedFiles: currentApplication.storedFiles,
  processImage: processImageFn,
  triggerProcessing: currentApplication.triggerRevisionProcessingIntent,
};

function resolveEntryDate(entryDate?: string, timezone?: string): string {
  if (entryDate != null && entryDate !== "") return entryDate;
  return getDateInTimezone(timezone) ?? formatDateTimeForApi(new Date());
}

export async function createAndQueueSourceDocument(
  input: CreateAndQueueSourceDocumentInput,
  dependencies: CreateAndQueueSourceDocumentDependencies = defaultDependencies
): Promise<CreateSourceDocumentResponseDto> {
  const validated = parseCreateSourceDocumentInput(
    omitUndefinedProperties({
      text: input.text,
      storedFileIds: input.storedFileIds,
      images: input.images,
      originalImages: input.originalImages,
      entryDate: input.entryDate,
      timezone: input.timezone,
    })
  );

  // Process inline images - decode, process, upload, finalize
  const imagesToProcess = validated.images ?? [];
  const originalImagesToProcess = validated.originalImages ?? [];

  if (originalImagesToProcess.length > 0) {
    throw new ValidationError("Images must be finalized before source-document submission");
  }

  const processedImageIds = imagesToProcess.length > 0
    ? await prepareInlineImages(
        imagesToProcess,
        dependencies.storedFiles,
        dependencies.processImage,
        input.ledgerId
      )
    : [];

  // Combine in input order: existing storedFileIds, then processed images
  const allStoredFileIds = [
    ...(validated.storedFileIds ?? []),
    ...processedImageIds,
  ];

  const pending = await dependencies.submissions.createPendingWithIntent({
    ledgerId: input.ledgerId,
    submittedText: validated.text ?? null,
    storedFileIds: allStoredFileIds,
    entryDate: resolveEntryDate(validated.entryDate, validated.timezone),
  });
  dependencies.triggerProcessing(pending.intent);
  return toSourceDocumentSubmissionContract(pending.document, pending.revision);
}

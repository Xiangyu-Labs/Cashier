import { ValidationError } from "@/lib/errors";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { omitUndefinedProperties } from "@/lib/validation";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { parseCreateSourceDocumentInput } from "@/modules/source-document/contract-schemas";
import { validateAggregateFileCount } from "@/modules/source-document/upload-policy";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import { prepareInlineImages } from "./prepare-inline-images";
import type { InlineImageUploader } from "./prepare-inline-images";

export interface CreateAndQueueSourceDocumentInput {
  ledgerId: string;
  ledger?: unknown;
  text?: string;
  storedFileIds?: string[];
  images?: Array<{ data: string; mimeType: string }>;
  originalImages?: Array<{ data: string; mimeType: string }>;
  maxDecodedImageBytes?: number;
  entryDate?: string;
  timezone?: string;
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

  const processedImageIds =
    imagesToProcess.length > 0
      ? await prepareInlineImages(
          imagesToProcess,
          dependencies.storedFiles,
          dependencies.processImage,
          input.ledgerId,
          input.maxDecodedImageBytes
        )
      : [];

  // Enforce aggregate file count after inline images are converted to stored-file IDs.
  // Protects against dependency/mock bypass of the schema-level check.
  const totalFileCount = (validated.storedFileIds?.length ?? 0) + processedImageIds.length;
  validateAggregateFileCount(totalFileCount, 0);

  // Combine in input order: existing storedFileIds, then processed images
  const allStoredFileIds = [...(validated.storedFileIds ?? []), ...processedImageIds];

  const pending = await dependencies.submissions.createPendingWithIntent({
    ledgerId: input.ledgerId,
    submittedText: validated.text ?? null,
    storedFileIds: allStoredFileIds,
    entryDate: resolveEntryDate(
      validated.entryDate,
      validated.timezone ?? readLedgerTimeZone(input.ledger)
    ),
  });
  dependencies.scheduleProcessing(pending.intent);
  return toSourceDocumentSubmissionContract(pending.document, pending.revision);
}

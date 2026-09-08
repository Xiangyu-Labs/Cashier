import { ValidationError } from "@/lib/errors";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
import { validateAggregateFileCount } from "@/lib/storage/upload-policy";
import { processImage as processImageFn } from "@/lib/storage/image-processing";
import type { PreparedInlineImage } from "@/modules/source-document/api-v1-policy";
import { prepareInlineImages } from "./prepare-inline-images";
import type { InlineImageUploader } from "./prepare-inline-images";

export interface CreateAndQueueSourceDocumentInput {
  ledgerId: string;
  evidence:
    | { kind: "stored"; text?: string; storedFileIds: string[] }
    | { kind: "inline"; images: PreparedInlineImage[] };
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

export async function createAndQueueSourceDocument(
  input: CreateAndQueueSourceDocumentInput,
  dependencies: CreateAndQueueSourceDocumentDependencies
): Promise<SourceDocumentSubmissionContract> {
  let createdUploadSessionId: string | null = null;
  const storedEvidence = input.evidence.kind === "stored" ? input.evidence : null;
  const inlineImages = input.evidence.kind === "inline" ? input.evidence.images : [];
  validateAggregateFileCount(storedEvidence?.storedFileIds.length ?? inlineImages.length, 0);
  if (
    storedEvidence != null &&
    (storedEvidence.text == null || storedEvidence.text === "") &&
    storedEvidence.storedFileIds.length === 0
  ) {
    throw new ValidationError("Content (text or images) is required");
  }
  if (input.evidence.kind === "inline" && inlineImages.length === 0) {
    throw new ValidationError("Content (text or images) is required");
  }

  const prepareSubmission = async () => {
    const preparedImages =
      inlineImages.length > 0
        ? await prepareInlineImages(
            inlineImages,
            dependencies.storedFiles,
            dependencies.processImage,
            input.ledgerId
          )
        : null;
    createdUploadSessionId = preparedImages?.uploadSessionId ?? null;
    const processedImageIds = preparedImages?.storedFileIds ?? [];

    return {
      ledgerId: input.ledgerId,
      submittedText: storedEvidence?.text ?? null,
      storedFileIds: [...(storedEvidence?.storedFileIds ?? []), ...processedImageIds],
      entryDate: resolveEntryDate(input.entryDate, input.timezone),
    };
  };

  let pending;
  try {
    pending = input.idempotency
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

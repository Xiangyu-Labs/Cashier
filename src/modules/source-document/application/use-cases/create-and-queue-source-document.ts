import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedProperties } from "@/lib/validation";
import type { SourceDocumentSubmissionPort } from "@/application/contracts";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { parseCreateSourceDocumentInput } from "@/modules/source-document/contract-schemas";

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
  triggerProcessing: (intent: Parameters<typeof currentApplication.triggerRevisionProcessingIntent>[0]) => void;
}

const defaultDependencies: CreateAndQueueSourceDocumentDependencies = {
  submissions: currentApplication.sourceDocumentSubmissions,
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
  if ((validated.images?.length ?? 0) > 0 || (validated.originalImages?.length ?? 0) > 0) {
    throw new ValidationError("Images must be finalized before source-document submission");
  }

  const pending = await dependencies.submissions.createPendingWithIntent({
    ledgerId: input.ledgerId,
    submittedText: validated.text ?? null,
    storedFileIds: validated.storedFileIds ?? [],
    entryDate: resolveEntryDate(validated.entryDate, validated.timezone),
  });
  dependencies.triggerProcessing(pending.intent);
  return toSourceDocumentSubmissionContract(pending.document, pending.revision);
}

import { ValidationError } from "@/lib/errors";
import type { SourceDocumentSubmissionPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";

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
  triggerProcessing: (intent: Parameters<typeof currentApplication.triggerRevisionProcessingIntent>[0]) => void;
}

const defaultDependencies: RetrySourceDocumentDependencies = {
  submissions: currentApplication.sourceDocumentSubmissions,
  triggerProcessing: currentApplication.triggerRevisionProcessingIntent,
};

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, input }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies = defaultDependencies
): Promise<RetrySourceDocumentResponseDto> {
  if ((input?.images?.length ?? 0) > 0 || (input?.originalImages?.length ?? 0) > 0) {
    throw new ValidationError("Images must be finalized before source-document retry");
  }

  const pending = await dependencies.submissions.createPendingWithIntent({
    ledgerId,
    sourceDocumentId,
    inheritEvidence: true,
    ...(input?.text === undefined ? {} : { submittedText: input.text }),
    ...(input?.storedFileIds === undefined ? {} : { storedFileIds: input.storedFileIds }),
    ...(input?.entryDate === undefined ? {} : { entryDate: input.entryDate }),
  });
  dependencies.triggerProcessing(pending.intent);

  return {
    sourceDocumentId: pending.document.id,
    previousSourceDocumentId: sourceDocumentId,
    status: "queued",
  };
}

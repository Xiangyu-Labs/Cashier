import { ValidationError } from "@/lib/errors";
import type { ProcessingIntentContract, SourceDocumentSubmissionPort } from "@/application/contracts";
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
  scheduleProcessing: (intent: ProcessingIntentContract) => void;
}

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, input }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
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
  dependencies.scheduleProcessing(pending.intent);

  return {
    sourceDocumentId: pending.document.id,
    previousSourceDocumentId: sourceDocumentId,
    status: "processing",
  };
}

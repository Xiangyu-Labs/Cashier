import { StaleSourceDocumentVersionError } from "@/lib/errors";
import type {
  ProcessingIntentContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type {
  RetrySourceDocumentResponseDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
import { staleVersionedCommandResult } from "../versioned-command-result";

interface SourceDocumentRetryPayload {
  text?: string;
  storedFileIds?: string[];
  entryDate?: string;
}

interface RetrySourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
  input?: SourceDocumentRetryPayload;
}

interface RetrySourceDocumentDependencies {
  submissions: Pick<SourceDocumentSubmissionPort, "createPendingWithIntent">;
  scheduleProcessing: (intent: ProcessingIntentContract) => void;
}

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, expectedVersion, input }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
): Promise<VersionedCommandResult<RetrySourceDocumentResponseDto>> {
  const submission = {
    ledgerId,
    sourceDocumentId,
    expectedVersion,
    inheritEvidence: true,
    supersedeProcessing: true,
    ...(input?.text === undefined ? {} : { submittedText: input.text }),
    ...(input?.storedFileIds === undefined ? {} : { storedFileIds: input.storedFileIds }),
    ...(input?.entryDate === undefined ? {} : { entryDate: input.entryDate }),
  };

  let pending;
  try {
    pending = await dependencies.submissions.createPendingWithIntent(submission);
  } catch (error) {
    if (error instanceof StaleSourceDocumentVersionError) {
      return staleVersionedCommandResult<RetrySourceDocumentResponseDto>(error);
    }
    throw error;
  }
  if (pending.idempotencyReplay !== true) dependencies.scheduleProcessing(pending.intent);

  return {
    ok: true,
    sourceDocumentId,
    version: pending.document.version,
    data: { status: "processing" as const },
  };
}

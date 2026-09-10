import { StaleSourceDocumentVersionError } from "@/lib/errors";
import type { ProcessingJobContract, SourceDocumentSubmissionPort } from "@/application/contracts";
import type {
  RetrySourceDocumentResponseDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
import { staleVersionedCommandResult } from "../versioned-command-result";

interface SourceDocumentRetryPayload {
  text: string | null;
  storedFileIds: string[];
  documentDate: string | null;
}

interface RetrySourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
  input?: SourceDocumentRetryPayload;
}

interface RetrySourceDocumentDependencies {
  submissions: Pick<SourceDocumentSubmissionPort, "submit">;
  scheduleProcessing: (job: ProcessingJobContract) => void;
}

export async function retrySourceDocument(
  { ledgerId, sourceDocumentId, expectedVersion, input }: RetrySourceDocumentInput,
  dependencies: RetrySourceDocumentDependencies
): Promise<VersionedCommandResult<RetrySourceDocumentResponseDto>> {
  const submission = {
    ledgerId,
    sourceDocumentId,
    expectedVersion,
    inheritInput: input == null,
    supersedeProcessing: true,
    ...(input == null ? {} : { input }),
  };

  let pending;
  try {
    pending = await dependencies.submissions.submit(submission);
  } catch (error) {
    if (error instanceof StaleSourceDocumentVersionError) {
      return staleVersionedCommandResult<RetrySourceDocumentResponseDto>(error);
    }
    throw error;
  }
  if (pending.idempotencyReplay !== true) dependencies.scheduleProcessing(pending.job);

  return {
    ok: true,
    sourceDocumentId,
    version: pending.document.version,
    data: { status: "processing" as const },
  };
}

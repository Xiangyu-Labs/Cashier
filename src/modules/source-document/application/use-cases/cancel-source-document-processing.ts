import { cancelPendingRevision } from "@/application/adapters/postgres";
import type { CancelProcessingResponseDto } from "@/modules/source-document/contracts";

interface CancelSourceDocumentProcessingInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

export async function cancelSourceDocumentProcessing({
  ledgerId,
  sourceDocumentId,
  revisionId,
}: CancelSourceDocumentProcessingInput): Promise<CancelProcessingResponseDto> {
  return cancelPendingRevision(ledgerId, sourceDocumentId, revisionId);
}

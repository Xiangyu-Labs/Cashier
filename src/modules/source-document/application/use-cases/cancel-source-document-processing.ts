import type { CancelProcessingResponseDto } from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";

interface CancelSourceDocumentProcessingInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

export async function cancelSourceDocumentProcessing(
  { ledgerId, sourceDocumentId, revisionId }: CancelSourceDocumentProcessingInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<CancelProcessingResponseDto> {
  return lifecycle.cancelPending(ledgerId, sourceDocumentId, revisionId);
}

import type { CancelProcessingResponseDto } from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";

interface RevisionLifecycleInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
}

export async function cancelSourceDocumentProcessing(
  { ledgerId, sourceDocumentId, expectedVersion }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<{ version: number; data: CancelProcessingResponseDto }> {
  const result = await lifecycle.cancelProcessing(ledgerId, sourceDocumentId, expectedVersion);
  return { version: result.version, data: { processingStatus: result.processingStatus } };
}

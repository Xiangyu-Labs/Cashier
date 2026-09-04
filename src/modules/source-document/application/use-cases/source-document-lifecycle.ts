import type {
  AbandonCandidateResponseDto,
  AcceptCandidateResponseDto,
  CancelProcessingResponseDto,
} from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";
import { NotFoundError } from "@/lib/errors";

interface RevisionLifecycleInput {
  ledgerId: string;
  sourceDocumentId: string;
  /** Internal compatibility only; browser transports never provide revision identity. */
  revisionId?: string;
  expectedVersion?: number;
}

export async function acceptSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, expectedVersion }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<{ version: number; data: AcceptCandidateResponseDto }> {
  const result = await lifecycle.acceptCandidate(ledgerId, sourceDocumentId, expectedVersion);
  return { version: result.version, data: { status: result.status } };
}

export async function abandonSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, expectedVersion }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<{ version: number; data: AbandonCandidateResponseDto }> {
  const abandoned = await lifecycle.abandonCandidate(ledgerId, sourceDocumentId, expectedVersion);
  if (!abandoned) throw new NotFoundError("Source document");
  return { version: abandoned.version, data: { status: abandoned.status } };
}

export async function cancelSourceDocumentProcessing(
  { ledgerId, sourceDocumentId, expectedVersion }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<{ version: number; data: CancelProcessingResponseDto }> {
  const result = await lifecycle.cancelPending(ledgerId, sourceDocumentId, expectedVersion);
  return { version: result.version, data: { status: result.status } };
}

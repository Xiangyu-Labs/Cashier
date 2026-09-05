import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import type { SourceDocumentQueryPorts } from "../ports";

function toLightDto(
  document: SourceDocumentDto,
  hasImages: boolean
): SourceDocumentLightWithEntriesDto {
  return {
    id: document.id,
    version: document.version,
    ledgerId: document.ledgerId,
    title: document.title,
    text: document.text,
    files: document.files,
    status: document.status,
    type: document.type,
    anomalyReason: document.anomalyReason,
    entryDate: document.entryDate,
    createdAt: document.createdAt,
    hasImages,
    supportedActions: document.supportedActions,
    canEdit: document.canEdit,
    errorCode: document.errorCode,
    ...(document.activeResultSummary !== undefined
      ? { activeResultSummary: document.activeResultSummary }
      : {}),
    ...(document.duplicateReview !== undefined
      ? { duplicateReview: document.duplicateReview }
      : {}),
    ledgerEntries: document.ledgerEntries ?? [],
  };
}

export async function getSourceDocumentLightForLedger(
  ledgerId: string,
  sourceDocumentId: string,
  ports: SourceDocumentQueryPorts
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const document = await ports.documents.get(ledgerId, sourceDocumentId);
  if (document == null) return null;

  return toLightDto(document, document.hasImages ?? false);
}

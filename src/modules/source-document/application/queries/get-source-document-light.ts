import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import type { SourceDocumentQueryPorts } from "../ports";

function toLightDto(
  document: SourceDocumentDto,
  ledgerEntries: SourceDocumentLightWithEntriesDto["ledgerEntries"],
  hasImages: boolean
): SourceDocumentLightWithEntriesDto {
  return {
    id: document.id,
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
    errorCode: document.errorCode,
    pendingRevisionId: document.pendingRevisionId,
    ...(document.activeResultSummary !== undefined
      ? { activeResultSummary: document.activeResultSummary }
      : {}),
    ...(document.duplicateReview !== undefined
      ? { duplicateReview: document.duplicateReview }
      : {}),
    ledgerEntries,
  };
}

export async function getSourceDocumentLight(
  sourceDocumentId: string,
  ports: SourceDocumentQueryPorts,
  authorizeLedger: (ledgerId: string) => Promise<unknown>
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(
    sourceDocumentId,
    ports.documents,
    authorizeLedger
  );

  if (accessContext == null) {
    return null;
  }

  const [document, entriesByDocId] = await Promise.all([
    ports.documents.get(accessContext.ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds(
      {
        ledgerId: accessContext.ledgerId,
        sourceDocumentIds: [sourceDocumentId],
        includeDuplicatePending: true,
      },
      ports.ledgerReads
    ),
  ]);

  if (document == null) {
    return null;
  }

  return toLightDto(
    document,
    entriesByDocId.get(document.id) ?? [],
    document.hasImages ?? accessContext.hasImages
  );
}

export async function getSourceDocumentLightForLedger(
  ledgerId: string,
  sourceDocumentId: string,
  ports: SourceDocumentQueryPorts
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const [document, entriesByDocId] = await Promise.all([
    ports.documents.get(ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds(
      { ledgerId, sourceDocumentIds: [sourceDocumentId], includeDuplicatePending: true },
      ports.ledgerReads
    ),
  ]);
  if (document == null) return null;

  return toLightDto(document, entriesByDocId.get(document.id) ?? [], document.hasImages ?? false);
}

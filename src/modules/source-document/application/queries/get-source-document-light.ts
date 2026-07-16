import { currentApplication } from "@/application/current";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";

function toLightDto(
  document: NonNullable<Awaited<ReturnType<typeof currentApplication.sourceDocumentReads.get>>>,
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
    ledgerEntries,
  };
}

export async function getSourceDocumentLight(
  sourceDocumentId: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(sourceDocumentId);

  if (accessContext == null) {
    return null;
  }

  const [document, entriesByDocId] = await Promise.all([
    currentApplication.sourceDocumentReads.get(accessContext.ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds({
      ledgerId: accessContext.ledgerId,
      sourceDocumentIds: [sourceDocumentId],
    }),
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
  sourceDocumentId: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const [document, entriesByDocId] = await Promise.all([
    currentApplication.sourceDocumentReads.get(ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds({
      ledgerId,
      sourceDocumentIds: [sourceDocumentId],
    }),
  ]);
  if (document == null) return null;

  return toLightDto(
    document,
    entriesByDocId.get(document.id) ?? [],
    document.hasImages ?? false
  );
}

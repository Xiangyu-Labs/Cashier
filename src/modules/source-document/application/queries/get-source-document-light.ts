import { db } from "@/lib/db";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { serializeSourceDocument } from "@/modules/source-document/mappers";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { sourceDocumentNotDeletedCondition } from "../source-document-state";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";

export async function getSourceDocumentLight(
  sourceDocumentId: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(sourceDocumentId);

  if (accessContext == null) {
    return null;
  }

  const document = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), sourceDocumentNotDeletedCondition()),
    columns: {
      id: true,
      ledgerId: true,
      title: true,
      text: true,
      status: true,
      type: true,
      anomalyReason: true,
      entryDate: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      imageUrls: true,
    },
  });

  if (document == null) {
    return null;
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId: accessContext.ledgerId,
    sourceDocumentIds: [document.id],
  });

  const serializedDocument = serializeSourceDocument(document, {
    stripMetadataFields: ["visionDescription", "originalImageUrls"],
    imageUrlsOverride: [],
    includeHasImages: true,
    ledgerEntries: entriesByDocId.get(document.id) ?? [],
  });

  const { imageUrls: _imageUrls, ...lightDocument } = serializedDocument;

  return {
    ...lightDocument,
    ledgerEntries: lightDocument.ledgerEntries ?? [],
    hasImages: accessContext.hasImages,
  };
}

"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/modules/auth/access";
import { serializeSourceDocument } from "@/modules/source-document/mappers";
import { AppError } from "@/lib/errors";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";

/**
 * Fetch a source document with light payload (excluding imageUrls).
 * Used for prefetching in list views where images are loaded on demand.
 */
export async function getSourceDocumentLightAction(
  id: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  // First, get just the ledgerId to check access
  const docMeta = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, id), isNull(sourceDocuments.deletedAt)),
    columns: { ledgerId: true, imageUrls: true },
  });

  if (!docMeta) {
    return null;
  }

  // Verify access
  try {
    await requireLedgerAccess(docMeta.ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      return null;
    }
    throw error;
  }

  // Fetch document (include imageUrls for serialization, will be stripped later)
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, id), isNull(sourceDocuments.deletedAt)),
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

  if (!doc) {
    return null;
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId: doc.ledgerId,
    sourceDocumentIds: [doc.id],
  });

  // Use unified serialization
  const serializedDoc = serializeSourceDocument(doc, {
    stripMetadataFields: ["visionDescription", "originalImageUrls"],
    imageUrlsOverride: [],
    includeHasImages: true,
    ledgerEntries: entriesByDocId.get(doc.id) ?? [],
  });

  const { imageUrls: _imageUrls, ...lightDoc } = serializedDoc;

  return {
    ...lightDoc,
    ledgerEntries: lightDoc.ledgerEntries ?? [],
    hasImages: (docMeta.imageUrls?.length ?? 0) > 0,
  };
}

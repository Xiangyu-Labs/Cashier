"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/modules/auth/helpers";
import { serializeSourceDocument } from "@/modules/source-document/mappers";
import { AppError } from "@/lib/errors";
import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

/**
 * Light version of SourceDocument for prefetching.
 * Contains all data except imageUrls.
 */
export interface SourceDocumentLight extends SourceDocumentDto {
  ledgerEntries: LedgerEntryDto[];
}

/**
 * Fetch a source document with light payload (excluding imageUrls).
 * Used for prefetching in list views where images are loaded on demand.
 */
export async function getSourceDocumentLightAction(
  id: string
): Promise<SourceDocumentLight | null> {
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
    with: {
      ledgerEntries: {
        where: isNull(ledgerEntries.deletedAt),
        with: { category: true },
      },
    },
  });

  if (!doc) {
    return null;
  }

  // Use unified serialization
  const serializedDoc = serializeSourceDocument(doc, {
    stripMetadataFields: ["visionDescription", "originalImageUrls"],
    imageUrlsOverride: [],
    includeHasImages: true,
    ledgerEntries: doc.ledgerEntries.map((entry) =>
      mapLedgerEntryDto({
        ...entry,
        category: entry.category,
      })
    ),
  });

  // Override hasImages using docMeta which has the actual imageUrls
  const result = serializedDoc as SourceDocumentLight;
  result.hasImages = (docMeta.imageUrls?.length ?? 0) > 0;

  // Delete imageUrls to match expected light response format
  delete (result as { imageUrls?: string[] }).imageUrls;

  return result;
}

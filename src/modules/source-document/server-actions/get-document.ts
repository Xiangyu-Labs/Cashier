"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/modules/auth/access";
import { AppError } from "@/lib/errors";
import { serializeSourceDocument } from "@/modules/source-document/mappers";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/queries";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";

// Return type for getSourceDocumentByIdAction - uses standardized API types
export type SourceDocumentWithEntries = SourceDocumentDto;

/**
 * Fetch a source document by its global ID.
 * Verifies access to the associated ledger.
 * Returns null for both "not found" and "not authorized" to avoid information leakage.
 *
 * Note: This action doesn't use withLedgerAccess because the ledgerId is not known
 * until after we fetch the document metadata. It also returns null instead of throwing
 * to avoid leaking document existence information.
 */
export async function getSourceDocumentByIdAction(
  id: string
): Promise<SourceDocumentWithEntries | null> {
  // First, get just the ledgerId to check access (minimal data exposure)
  const docMeta = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, id), isNull(sourceDocuments.deletedAt)),
    columns: { ledgerId: true },
  });

  if (!docMeta) {
    return null;
  }

  // Verify access before fetching full document
  try {
    await requireLedgerAccess(docMeta.ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      // Return null instead of throwing to avoid leaking document existence
      return null;
    }
    throw error;
  }

  // Now fetch full document with relations
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, id), isNull(sourceDocuments.deletedAt)),
  });

  if (!doc) {
    return null;
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId: doc.ledgerId,
    sourceDocumentIds: [doc.id],
  });

  return serializeSourceDocument(doc, {
    ledgerEntries: entriesByDocId.get(doc.id) ?? [],
  });
}

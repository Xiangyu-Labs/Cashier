"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { type SerializedSourceDocument, serializeSourceDocument } from "@/lib/serialization";
import { AppError } from "@/lib/errors";

// Return type for getSourceDocumentByIdAction - uses standardized API types
export type SourceDocumentWithEntries = SerializedSourceDocument;

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
    with: {
      ledgerEntries: {
        where: (entries, { isNull }) => isNull(entries.deletedAt),
        with: { category: true },
      },
    },
  });

  if (!doc) {
    return null;
  }

  // Serialize to JSON-compatible format with string dates
  return serializeSourceDocument(doc);
}

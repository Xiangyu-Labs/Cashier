"use server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server";
import { serializeLedgerEntry, type SerializedLedgerEntry } from "@/lib/serialization";
import { AppError, UnauthorizedError } from "@/lib/errors";

export async function getLedgerEntryAction(id: string): Promise<SerializedLedgerEntry | null> {
  const entry = await db.query.ledgerEntries.findFirst({
    where: eq(ledgerEntries.id, id),
    with: {
      category: true,
      sourceDocument: true,
    },
  });

  if (!entry) {
    return null;
  }

  // Verify access to the ledger this entry belongs to
  // We do this AFTER fetching because we need the ledgerId
  // Note: This action doesn't use withLedgerAccess because the ledgerId
  // is not known until after we fetch the entry
  try {
    await requireLedgerAccess(entry.ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized");
    }
    throw error;
  }

  // Use unified serialization
  const serializedEntry = serializeLedgerEntry({
    ...entry,
    category: entry.category,
    sourceDocument: entry.sourceDocument
      ? {
          id: entry.sourceDocument.id,
          title: entry.sourceDocument.title,
        }
      : undefined,
  });

  // Strip large metadata fields from sourceDocument to reduce payload size
  if (serializedEntry.sourceDocument) {
    const {
      visionDescription: _visionDescription,
      originalImageUrls: _originalImageUrls,
      ...lightMetadata
    } =
      serializedEntry.sourceDocument.metadata || {};
    serializedEntry.sourceDocument = {
      ...serializedEntry.sourceDocument,
      metadata: lightMetadata,
      imageUrls: [], // Strip image URLs
      hasImages: (entry.sourceDocument?.imageUrls?.length ?? 0) > 0,
    };
  }

  return serializedEntry;
}

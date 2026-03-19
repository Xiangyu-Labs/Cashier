"use server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/persistence";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/modules/auth/helpers";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

export async function getLedgerEntryAction(id: string): Promise<LedgerEntryDto | null> {
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
  const serializedEntry = mapLedgerEntryDto({
    ...entry,
    category: entry.category,
    sourceDocument: entry.sourceDocument,
  });

  // Strip large metadata fields from sourceDocument to reduce payload size
  if (serializedEntry.sourceDocument != null) {
    const {
      visionDescription: _visionDescription,
      originalImageUrls: _originalImageUrls,
      ...lightMetadata
    } =
      serializedEntry.sourceDocument.metadata ?? {};
    serializedEntry.sourceDocument = {
      ...serializedEntry.sourceDocument,
      metadata: lightMetadata,
      imageUrls: [], // Strip image URLs
      hasImages: (entry.sourceDocument?.imageUrls?.length ?? 0) > 0,
    };
  }

  return serializedEntry;
}

import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/modules/auth/access";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { db } from "@/lib/db";
import { mapLedgerEntryDto } from "@/modules/ledger/application/mappers";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { ledgerEntries } from "@/persistence";

export async function getLedgerEntryDetail(id: string): Promise<LedgerEntryDto | null> {
  const entry = await db.query.ledgerEntries.findFirst({
    where: eq(ledgerEntries.id, id),
    with: {
      category: true,
      sourceDocument: true,
    },
  });

  if (entry == null) {
    return null;
  }

  try {
    await requireLedgerAccess(entry.ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized");
    }
    throw error;
  }

  const serializedEntry = mapLedgerEntryDto({
    ...entry,
    category: entry.category,
    sourceDocument: entry.sourceDocument,
  });

  if (serializedEntry.sourceDocument != null) {
    const {
      visionDescription: _visionDescription,
      originalImageUrls: _originalImageUrls,
      ...lightMetadata
    } = serializedEntry.sourceDocument.metadata ?? {};

    serializedEntry.sourceDocument = {
      ...serializedEntry.sourceDocument,
      metadata: lightMetadata,
      imageUrls: [],
      hasImages: (entry.sourceDocument?.imageUrls?.length ?? 0) > 0,
    };
  }

  return serializedEntry;
}

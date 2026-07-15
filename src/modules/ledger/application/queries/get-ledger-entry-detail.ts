import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { mapLedgerEntryDto } from "@/modules/ledger/application/mappers";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { ledgerEntries } from "@/persistence";
import { buildLedgerEntryVisibilityCondition } from "./ledger-entry-visibility";

export async function getLedgerEntryDetail(
  id: string,
  ledgerId: string
): Promise<LedgerEntryDto | null> {
  const entry = await db.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.id, id),
      eq(ledgerEntries.ledgerId, ledgerId),
      isNull(ledgerEntries.deletedAt),
      buildLedgerEntryVisibilityCondition(ledgerId)
    ),
    with: {
      category: true,
      sourceDocument: true,
    },
  });

  if (entry == null) {
    return null;
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

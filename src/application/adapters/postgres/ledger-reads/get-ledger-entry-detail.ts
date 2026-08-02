import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { mapLedgerEntryDto } from "./mappers";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { ledgerEntries, revisionFiles } from "@/persistence";
import { buildLedgerEntryVisibilityCondition } from "./ledger-entry-visibility";

// Current-runtime read implementation.

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
      sourceDocument: {
        columns: {
          id: true,
          ledgerId: true,
          title: true,
          type: true,
          entryDate: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      },
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
    const hasImages =
      entry.sourceDocumentRevisionId != null &&
      (await db.query.revisionFiles.findFirst({
        where: eq(revisionFiles.revisionId, entry.sourceDocumentRevisionId),
        columns: { id: true },
      })) != null;
    serializedEntry.sourceDocument = {
      ...serializedEntry.sourceDocument,
      status: "completed",
      hasImages,
    };
  }

  return serializedEntry;
}

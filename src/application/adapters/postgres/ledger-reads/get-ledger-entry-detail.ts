import { and, eq, isNull, sql } from "drizzle-orm";
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
    extras: (entry) => ({
      hasImages: sql<boolean>`EXISTS (
        SELECT 1 FROM ${revisionFiles} image
        WHERE image.ledger_id = ${ledgerId}
          AND image.revision_id = ${entry.sourceDocumentRevisionId}
      )`.as("has_images"),
    }),
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
          version: true,
          ledgerId: true,
          title: true,
          documentDate: true,
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
    serializedEntry.sourceDocument = {
      ...serializedEntry.sourceDocument,
      hasImages: entry.hasImages,
    };
  }

  return serializedEntry;
}

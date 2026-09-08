import { and, asc, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import { mapLedgerEntryEmbeddedViewDto } from "./mappers";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import { buildLedgerEntryVisibilityCondition } from "./ledger-entry-visibility";

interface ListLedgerEntryViewsBySourceDocumentIdsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
  /** Also load pending-revision entries of duplicate_pending documents. */
  includeDuplicatePending?: boolean;
}

export async function listLedgerEntryViewsBySourceDocumentIds({
  ledgerId,
  sourceDocumentIds,
  includeDuplicatePending = false,
}: ListLedgerEntryViewsBySourceDocumentIdsInput): Promise<
  Map<string, LedgerEntryEmbeddedViewDto[]>
> {
  const entriesBySourceDocumentId = new Map<string, LedgerEntryEmbeddedViewDto[]>();

  if (sourceDocumentIds.length === 0) {
    return entriesBySourceDocumentId;
  }

  const q = forLedger(ledgerEntries, ledgerId);
  const entries = await db.query.ledgerEntries.findMany({
    where: and(
      q.whereActive,
      inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds),
      includeDuplicatePending
        ? or(
            buildLedgerEntryVisibilityCondition(ledgerId),
            sql`EXISTS (
              SELECT 1 FROM source_documents sd
              WHERE sd.ledger_id = ${ledgerEntries.ledgerId}
                AND sd.id = ${ledgerEntries.sourceDocumentId}
                AND sd.deleted_at IS NULL
                AND sd.current_status = 'duplicate_pending'
                AND sd.pending_revision_id = ${ledgerEntries.sourceDocumentRevisionId}
            )`
          )
        : buildLedgerEntryVisibilityCondition(ledgerId)
    ),
    with: { category: true },
    orderBy: [
      asc(ledgerEntries.sourceDocumentId),
      asc(ledgerEntries.position),
      asc(ledgerEntries.id),
    ],
  });

  for (const entry of entries) {
    if (entry.sourceDocumentId == null || entry.sourceDocumentId === "") {
      continue;
    }

    const list = entriesBySourceDocumentId.get(entry.sourceDocumentId) ?? [];
    list.push(
      mapLedgerEntryEmbeddedViewDto({
        ...entry,
        category: entry.category,
      })
    );
    entriesBySourceDocumentId.set(entry.sourceDocumentId, list);
  }

  return entriesBySourceDocumentId;
}

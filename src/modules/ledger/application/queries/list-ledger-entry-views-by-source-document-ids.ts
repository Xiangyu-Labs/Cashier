import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import { mapLedgerEntryEmbeddedViewDto } from "../mappers";
import type { LedgerEntryEmbeddedViewDto } from "../../contracts";

interface ListLedgerEntryViewsBySourceDocumentIdsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
}

export async function listLedgerEntryViewsBySourceDocumentIds({
  ledgerId,
  sourceDocumentIds,
}: ListLedgerEntryViewsBySourceDocumentIdsInput): Promise<
  Map<string, LedgerEntryEmbeddedViewDto[]>
> {
  const entriesBySourceDocumentId = new Map<string, LedgerEntryEmbeddedViewDto[]>();

  if (sourceDocumentIds.length === 0) {
    return entriesBySourceDocumentId;
  }

  const q = forLedger(ledgerEntries, ledgerId);
  const entries = await db.query.ledgerEntries.findMany({
    where: and(q.whereActive, inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)),
    with: { category: true },
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

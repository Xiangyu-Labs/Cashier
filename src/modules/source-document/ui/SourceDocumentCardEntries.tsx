import type { LedgerEntry } from "@/modules/ledger/contracts";
import { memo } from "react";

import { LedgerEntryItem } from "./LedgerEntryItem";

interface SourceDocumentCardEntriesProps {
  entries: LedgerEntry[];
  mainCurrency: string;
  sourceDocumentEntryDate?: string | null | undefined;
  onViewLedgerEntry?: ((ledgerEntry: LedgerEntry) => void) | undefined;
}

export const SourceDocumentCardEntries = memo(function SourceDocumentCardEntries({
  entries,
  mainCurrency,
  sourceDocumentEntryDate,
  onViewLedgerEntry,
}: SourceDocumentCardEntriesProps) {
  return (
    <div className="divide-y divide-border border-t border-border px-3">
      {entries.map((entry) => (
        <LedgerEntryItem
          key={entry.id}
          ledgerEntry={entry}
          onView={() => {
            onViewLedgerEntry?.(entry);
          }}
          mainCurrency={mainCurrency}
          variant="default"
          {...(sourceDocumentEntryDate !== undefined ? { sourceDocumentEntryDate } : {})}
        />
      ))}
    </div>
  );
});

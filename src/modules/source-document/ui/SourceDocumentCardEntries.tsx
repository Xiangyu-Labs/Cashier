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
    <div className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30">
      {entries.map((entry) => (
        <LedgerEntryItem
          key={entry.id}
          ledgerEntry={entry}
          onView={() => {
            onViewLedgerEntry?.(entry);
          }}
          mainCurrency={mainCurrency}
          variant="default"
          {...(sourceDocumentEntryDate !== undefined
            ? { sourceDocumentEntryDate }
            : {})}
        />
      ))}
    </div>
  );
});

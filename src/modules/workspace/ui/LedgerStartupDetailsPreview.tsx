"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EntryFilters } from "@/modules/ledger/ui";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { EntryFilterPanel } from "@/modules/ledger/ui";
import { LedgerEntryGroupsView } from "@/modules/ledger/ui/LedgerEntryGroupsView";
import { useDetailsTabGrouping } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";
import { useCachedImageUrls } from "@/modules/source-document/hooks";
import { formatCurrencyAmount } from "@/lib/format/currency";
import {
  CACHED_DETAILS_PREVIEW_LIMIT,
  type LedgerStartupCacheSnapshot,
} from "@/modules/workspace/ledger-startup-cache-store";
import {
  selectCachedDocuments,
  totalCachedMatches,
} from "@/modules/workspace/ledger-startup-cache-selectors";
import { EntriesToolbarShell } from "./EntriesToolbarShell";

interface LedgerStartupDetailsPreviewProps {
  snapshot: LedgerStartupCacheSnapshot;
  initialFilters: EntryFilters;
}

export function LedgerStartupDetailsPreview({
  snapshot,
  initialFilters,
}: LedgerStartupDetailsPreviewProps) {
  const locale = useLocale();
  const t = useTranslations("LedgerPage");
  const [filters, setFilters] = useState<EntryFilters>(initialFilters);
  const [selected, setSelected] = useState<SourceDocument | null>(null);
  const mainCurrency = snapshot.mainCurrency ?? "CNY";

  const matches = useMemo(
    () => selectCachedDocuments(snapshot.items, filters),
    [filters, snapshot.items]
  );
  const entries = useMemo(() => {
    const flattened = matches.flatMap((match) =>
      match.displayEntries.map((entry) => ({ ...entry, sourceDocument: match.document }))
    ) as LedgerEntry[];
    return flattened.slice(0, CACHED_DETAILS_PREVIEW_LIMIT);
  }, [matches]);
  const { groupedItems } = useDetailsTabGrouping(
    entries,
    snapshot.ledgerSettings?.timeZone ?? undefined
  );
  const visibleFileIds = useMemo(() => {
    const documents = new Map<string, string[]>();
    for (const entry of entries) {
      const document = matches.find((match) => match.document.id === entry.sourceDocumentId);
      if (document != null)
        documents.set(
          document.document.id,
          document.document.files.map((f) => f.id)
        );
    }
    return [...documents.values()].flat();
  }, [entries, matches]);
  const cachedImageUrls = useCachedImageUrls(snapshot.key, visibleFileIds);

  return (
    <>
      <EntriesToolbarShell
        totalLabel={formatCurrencyAmount(totalCachedMatches(matches), mainCurrency, locale)}
      >
        <EntryFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          categories={snapshot.categories ?? []}
          preferredCurrencies={snapshot.preferredCurrencies ?? []}
          showStatus={false}
          onResetFilters={() => setFilters({})}
        />
      </EntriesToolbarShell>
      {groupedItems.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("cachedNoRecords")}
        </p>
      ) : (
        <div className="space-y-6 pt-2">
          <LedgerEntryGroupsView
            groups={groupedItems}
            categories={snapshot.categories ?? []}
            mainCurrency={mainCurrency}
            onView={(entry) => {
              const document = matches.find(
                (item) => item.document.id === entry.sourceDocumentId
              )?.document;
              if (document != null) setSelected(document as unknown as SourceDocument);
            }}
          />
        </div>
      )}
      <SourceDocumentDetailModal
        ledgerId={snapshot.ledgerId}
        sourceDocument={selected}
        ledgerEntries={(selected?.ledgerEntries ?? []) as LedgerEntry[]}
        categories={snapshot.categories ?? []}
        preferredCurrencies={snapshot.preferredCurrencies ?? []}
        mainCurrency={mainCurrency}
        open={selected != null}
        onClose={() => setSelected(null)}
        onUpdateSourceDoc={async () => {}}
        onUpdateEntry={async () => {}}
        onBatchUpdate={async () => undefined}
        onDeleteEntry={async () => {}}
        readOnly
        cachedImageUrls={cachedImageUrls}
      />
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntryFilters } from "@/modules/ledger/ui";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { buildUnifiedStreamGroups } from "@/modules/source-document/stream-grouping";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";
import { useCachedImageUrls } from "@/modules/source-document/hooks";
import {
  CACHED_STREAM_PREVIEW_LIMIT,
  type LedgerStartupCacheSnapshot,
} from "@/modules/workspace/ledger-startup-cache-store";
import {
  selectCachedDocuments,
  totalCachedMatches,
} from "@/modules/workspace/ledger-startup-cache-selectors";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesUnifiedGroups } from "./LedgerEntriesCompletedGroups";
import { STREAM_STATUS_PRESET_VALUES } from "../ledger-filter-state";

interface LedgerStartupStreamPreviewProps {
  snapshot: LedgerStartupCacheSnapshot;
  initialFilters: EntryFilters;
}

export function LedgerStartupStreamPreview({
  snapshot,
  initialFilters,
}: LedgerStartupStreamPreviewProps) {
  const t = useTranslations("LedgerPage");
  const [filters, setFilters] = useState<EntryFilters>(initialFilters);
  const [selected, setSelected] = useState<SourceDocument | null>(null);

  const matches = useMemo(
    () => selectCachedDocuments(snapshot.items, filters),
    [filters, snapshot.items]
  );
  const displayDocuments = useMemo(
    () =>
      matches.slice(0, CACHED_STREAM_PREVIEW_LIMIT).map(({ document, displayEntries }) => ({
        ...document,
        ledgerEntries: displayEntries,
      })),
    [matches]
  );
  const streamGroups = useMemo(
    () => buildUnifiedStreamGroups(displayDocuments),
    [displayDocuments]
  );
  const visibleFileIds = useMemo(
    () => displayDocuments.flatMap((document) => document.files.map((file) => file.id)),
    [displayDocuments]
  );
  const cachedImageUrls = useCachedImageUrls(snapshot.key, visibleFileIds);
  const mainCurrency = snapshot.mainCurrency ?? "CNY";
  const periodParams =
    filters.startDate != null || filters.endDate != null
      ? {
          period: "custom" as const,
          ...(filters.startDate != null ? { startDate: filters.startDate } : {}),
          ...(filters.endDate != null ? { endDate: filters.endDate } : {}),
        }
      : { period: "all" as const };
  const hasAnyFilter = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value != null && value !== ""
  );

  return (
    <>
      <LedgerEntriesToolbar
        isSelectionMode={false}
        isAllSelected={false}
        selectedCount={0}
        onToggleSelectionMode={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        filters={filters}
        onFiltersChange={setFilters}
        periodParams={periodParams}
        {...(!hasAnyFilter ? { totalPrefix: t("total") } : {})}
        mainCurrency={mainCurrency}
        filteredTotal={totalCachedMatches(matches)}
        onApplyPreset={(preset) =>
          setFilters({ ...filters, statuses: STREAM_STATUS_PRESET_VALUES[preset] })
        }
        onResetFilters={() => setFilters({})}
        readOnly
      />
      <LedgerEntriesUnifiedGroups
        streamGroups={streamGroups}
        mainCurrency={mainCurrency}
        onViewLedgerEntry={(entry) => {
          const document = matches.find(
            (match) => match.document.id === entry.sourceDocumentId
          )?.document;
          if (document != null) setSelected(document as unknown as SourceDocument);
        }}
        onViewSourceDetail={({ sourceDocument }) =>
          setSelected(sourceDocument as unknown as SourceDocument)
        }
        onDeleteSourceConfirm={() => {}}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={() => {}}
        noRecordsText={t("cachedNoRecords")}
        getItemProps={() => ({})}
        {...(snapshot.ledgerSettings?.timeZone != null
          ? { timeZone: snapshot.ledgerSettings.timeZone }
          : {})}
        readOnly
        collapseEntriesDefault={snapshot.ledgerSettings?.collapseEntriesDefault ?? false}
      />
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

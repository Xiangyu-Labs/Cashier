"use client";

import { useEffect, useMemo, useState } from "react";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocument,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { buildUnifiedStreamGroups } from "@/modules/source-document/stream-grouping";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";
import { STREAM_STATUS_PRESET_VALUES } from "@/modules/workspace/ledger-filter-state";
import { useConnectionState } from "./connection-state";
import {
  getActiveOfflineSnapshotKey,
  readOfflineImages,
  readOfflineSnapshot,
  type OfflineLedgerSnapshot,
} from "./offline-store";

function searchable(item: SourceDocumentListItemDto) {
  return [
    item.title,
    item.entryDate,
    ...(item.ledgerEntries ?? []).flatMap((entry) => [
      entry.itemName,
      entry.description,
      entry.amount,
      entry.currency,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function matchesFilters(item: SourceDocumentListItemDto, filters: EntryFilters) {
  if (filters.startDate != null && (item.entryDate == null || item.entryDate < filters.startDate)) {
    return false;
  }
  if (filters.endDate != null && (item.entryDate == null || item.entryDate > filters.endDate)) {
    return false;
  }
  if ((filters.statuses?.length ?? 0) > 0 && !filters.statuses!.includes(item.status)) return false;
  const query = filters.search?.trim().toLocaleLowerCase();
  if (query != null && query !== "" && !searchable(item).includes(query)) return false;
  if (filters.minAmount != null || filters.maxAmount != null) {
    const amounts = (item.ledgerEntries ?? [])
      .map((entry) => Number(entry.convertedAmount ?? entry.amount))
      .filter(Number.isFinite);
    if (amounts.length === 0) return false;
    if (filters.minAmount != null && Math.max(...amounts) < filters.minAmount) return false;
    if (filters.maxAmount != null && Math.min(...amounts) > filters.maxAmount) return false;
  }
  return true;
}

function totalFor(items: SourceDocumentListItemDto[]) {
  return items.reduce(
    (total, item) =>
      total +
      (item.status === "completed"
        ? (item.ledgerEntries ?? []).reduce((sum, entry) => {
            const amount = Number(entry.convertedAmount ?? entry.amount);
            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0)
        : 0),
    0
  );
}

export function OfflineLedgerView() {
  const { retry } = useConnectionState();
  const [snapshot, setSnapshot] = useState<OfflineLedgerSnapshot | null>(null);
  const [items, setItems] = useState<SourceDocumentListItemDto[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<EntryFilters>({});
  const [selected, setSelected] = useState<SourceDocumentListItemDto | null>(null);

  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    const load = async () => {
      const key = getActiveOfflineSnapshotKey();
      if (key == null) return;
      const [nextSnapshot, images] = await Promise.all([
        readOfflineSnapshot(key),
        readOfflineImages(key),
      ]);
      if (disposed || nextSnapshot == null) return;
      const seen = new Set<string>();
      setSnapshot(nextSnapshot);
      setItems(
        [...nextSnapshot.items, ...(nextSnapshot.viewedItems ?? [])].filter(
          (item) => !seen.has(item.id) && seen.add(item.id)
        )
      );
      const mapped = new Map<string, string>();
      for (const image of images) {
        const url = URL.createObjectURL(image.blob);
        urls.push(url);
        mapped.set(image.fileId, url);
      }
      setImageUrls(mapped);
    };
    void load();
    return () => {
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const filtered = useMemo(
    () => items.filter((item) => matchesFilters(item, filters)),
    [filters, items]
  );
  const streamGroups = useMemo(() => buildUnifiedStreamGroups(filtered), [filtered]);
  const zh = (snapshot?.locale ?? navigator.language).startsWith("zh");
  const mainCurrency = snapshot?.mainCurrency ?? "CNY";
  const periodParams =
    filters.startDate != null || filters.endDate != null
      ? {
          period: "custom" as const,
          ...(filters.startDate != null ? { startDate: filters.startDate } : {}),
          ...(filters.endDate != null ? { endDate: filters.endDate } : {}),
        }
      : { period: "all" as const };

  return (
    <PullToRefresh
      onRefresh={async () => retry()}
      header={
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
          filteredTotalLabel={zh ? "合计" : "Total"}
          mainCurrency={mainCurrency}
          filteredTotal={totalFor(filtered)}
          onApplyPreset={(preset) =>
            setFilters((current) => ({ ...current, statuses: STREAM_STATUS_PRESET_VALUES[preset] }))
          }
          onResetFilters={() => setFilters({})}
          readOnly
        />
      }
    >
      <LedgerEntriesUnifiedGroups
        streamGroups={streamGroups}
        mainCurrency={mainCurrency}
        onViewSourceDetail={({ sourceDocument }) =>
          setSelected(items.find((item) => item.id === sourceDocument.id) ?? null)
        }
        onDeleteSourceConfirm={() => {}}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={() => {}}
        noRecordsText={zh ? "暂无已缓存账单" : "No cached transactions"}
        getItemProps={() => ({})}
        {...(snapshot?.ledgerSettings?.timeZone != null
          ? { timeZone: snapshot.ledgerSettings.timeZone }
          : {})}
        readOnly
      />

      <SourceDocumentDetailModal
        ledgerId={snapshot?.ledgerId ?? selected?.ledgerId ?? "offline"}
        sourceDocument={selected as SourceDocument | null}
        ledgerEntries={(selected?.ledgerEntries ?? []) as LedgerEntry[]}
        categories={snapshot?.categories ?? []}
        preferredCurrencies={snapshot?.preferredCurrencies ?? []}
        mainCurrency={mainCurrency}
        open={selected != null}
        onClose={() => setSelected(null)}
        onUpdateSourceDoc={async () => {}}
        onUpdateEntry={async () => {}}
        onBatchUpdate={async () => undefined}
        onDeleteEntry={async () => {}}
        readOnly
        offlineImageUrls={imageUrls}
      />
    </PullToRefresh>
  );
}

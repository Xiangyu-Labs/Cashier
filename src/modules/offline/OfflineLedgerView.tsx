"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { LedgerEntryGroupsView } from "@/modules/ledger/ui/LedgerEntryGroupsView";
import { useDetailsTabGrouping } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocument,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { buildUnifiedStreamGroups } from "@/modules/source-document/stream-grouping";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { formatCurrencyAmount } from "@/lib/format/currency";
import {
  addPeriod,
  formatCivilDate,
  formatDateTimeForApi,
  parseDateString,
  type DateRangeType,
} from "@/lib/date-utils";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";
import { EntriesToolbarShell } from "@/modules/workspace/ui/EntriesToolbarShell";
import { STREAM_STATUS_PRESET_VALUES } from "@/modules/workspace/ledger-filter-state";
import { useConnectionState } from "./connection-state";
import { StatsContentView } from "@/modules/stats/ui";
import {
  DEFAULT_STATS_RANGE_TYPE,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";
import {
  buildOfflineEnhancedStats,
  selectOfflineDocuments,
  totalOfflineMatches,
} from "./offline-selectors";
import {
  getActiveOfflineSnapshotKey,
  readOfflineImages,
  readOfflineSnapshot,
  type OfflineLedgerSnapshot,
} from "./offline-store";

type LoadState = "loading" | "ready" | "no-cache" | "empty" | "error";

interface OfflineLedgerViewProps {
  /** Required in the authenticated workspace. Omit only for the PWA cold-start route. */
  snapshotKey?: string;
  activeTab?: LedgerTab;
  initialFilters?: EntryFilters;
  onFiltersChange?: (filters: EntryFilters) => void;
}

export function OfflineLedgerView({
  snapshotKey,
  activeTab: activeTabProp,
  initialFilters = {},
  onFiltersChange,
}: OfflineLedgerViewProps = {}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { retry, syncStatus } = useConnectionState();
  const [snapshot, setSnapshot] = useState<OfflineLedgerSnapshot | null>(null);
  const [items, setItems] = useState<SourceDocumentListItemDto[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<EntryFilters>(initialFilters);
  const [selected, setSelected] = useState<SourceDocumentListItemDto | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const activeTab = activeTabProp ?? parseLedgerTab(searchParams);
  const effectiveFilters = onFiltersChange != null ? initialFilters : filters;

  useEffect(() => {
    let disposed = false;
    let urls: string[] = [];
    const load = async () => {
      setLoadState("loading");
      try {
        const key = snapshotKey ?? getActiveOfflineSnapshotKey();
        if (key == null) {
          setLoadState("no-cache");
          return;
        }
        const [nextSnapshot, images] = await Promise.all([
          readOfflineSnapshot(key),
          readOfflineImages(key),
        ]);
        if (disposed) return;
        if (nextSnapshot == null) {
          setLoadState("no-cache");
          return;
        }
        const seen = new Set<string>();
        const nextItems = [...nextSnapshot.items, ...(nextSnapshot.viewedItems ?? [])].filter(
          (item) => !seen.has(item.id) && seen.add(item.id)
        );
        setSnapshot(nextSnapshot);
        setItems(nextItems);
        setLoadState(nextItems.length === 0 ? "empty" : "ready");
        urls.forEach((url) => URL.revokeObjectURL(url));
        urls = [];
        const mapped = new Map<string, string>();
        for (const image of images) {
          const url = URL.createObjectURL(image.blob);
          urls.push(url);
          mapped.set(image.fileId, url);
        }
        setImageUrls(mapped);
      } catch {
        if (!disposed) setLoadState("error");
      }
    };
    const onSnapshot = (event: Event) => {
      if (
        (event as CustomEvent<string>).detail === (snapshotKey ?? getActiveOfflineSnapshotKey())
      ) {
        void load();
      }
    };
    void load();
    window.addEventListener("cashier:offline-snapshot", onSnapshot);
    return () => {
      disposed = true;
      window.removeEventListener("cashier:offline-snapshot", onSnapshot);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [snapshotKey]);

  const matches = useMemo(
    () => selectOfflineDocuments(items, effectiveFilters),
    [effectiveFilters, items]
  );
  const displayDocuments = useMemo(
    () =>
      matches.map(({ document, displayEntries }) => ({
        ...document,
        ledgerEntries: displayEntries,
      })),
    [matches]
  );
  const streamGroups = useMemo(
    () => buildUnifiedStreamGroups(displayDocuments),
    [displayDocuments]
  );
  const mainCurrency = snapshot?.mainCurrency ?? "CNY";
  const periodParams =
    effectiveFilters.startDate != null || effectiveFilters.endDate != null
      ? {
          period: "custom" as const,
          ...(effectiveFilters.startDate != null ? { startDate: effectiveFilters.startDate } : {}),
          ...(effectiveFilters.endDate != null ? { endDate: effectiveFilters.endDate } : {}),
        }
      : { period: "all" as const };
  const hasAnyFilter = Object.values(effectiveFilters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value != null && value !== ""
  );
  const statusText =
    syncStatus === "checking" || syncStatus === "downloading"
      ? locale.startsWith("zh")
        ? "正在更新本地缓存"
        : "Updating local cache"
      : snapshot != null
        ? `${locale.startsWith("zh") ? "更新于" : "Updated"} ${new Date(snapshot.lastSyncedAt).toLocaleString(locale)}`
        : undefined;

  const setNextFilters = (next: EntryFilters) => {
    setFilters(next);
    onFiltersChange?.(next);
  };

  if (loadState !== "ready" || snapshot == null) {
    return <SnapshotState state={loadState} zh={locale.startsWith("zh")} />;
  }

  return (
    <>
      {snapshot != null && (snapshot.truncated || isStale(snapshot.lastSyncedAt)) ? (
        <div className="mx-2 mb-2 flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text">
          <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          {snapshot.truncated
            ? locale.startsWith("zh")
              ? `统计和合计基于最近 ${snapshot.coverageLimit} 条缓存`
              : `Totals and stats use the latest ${snapshot.coverageLimit} cached records`
            : locale.startsWith("zh")
              ? "本地缓存可能已过期"
              : "The local cache may be out of date"}
        </div>
      ) : null}

      {activeTab === "stream" ? (
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
              filters={effectiveFilters}
              onFiltersChange={setNextFilters}
              periodParams={periodParams}
              {...(!hasAnyFilter
                ? { totalPrefix: locale.startsWith("zh") ? "合计" : "Total" }
                : {})}
              mainCurrency={mainCurrency}
              filteredTotal={totalOfflineMatches(matches)}
              onApplyPreset={(preset) =>
                setNextFilters({
                  ...effectiveFilters,
                  statuses: STREAM_STATUS_PRESET_VALUES[preset],
                })
              }
              onResetFilters={() => setNextFilters({})}
              readOnly
              syncStatus={statusText}
            />
          }
        >
          <LedgerEntriesUnifiedGroups
            streamGroups={streamGroups}
            mainCurrency={mainCurrency}
            onViewLedgerEntry={(entry) => {
              const document = items.find((item) => item.id === entry.sourceDocumentId);
              if (document != null) setSelected(document);
            }}
            onViewSourceDetail={({ sourceDocument }) =>
              setSelected(items.find((item) => item.id === sourceDocument.id) ?? null)
            }
            onDeleteSourceConfirm={() => {}}
            isSelectionMode={false}
            selectedIds={[]}
            onToggleSelection={() => {}}
            noRecordsText={
              locale.startsWith("zh") ? "没有符合条件的缓存单据" : "No cached records match"
            }
            getItemProps={() => ({})}
            {...(snapshot?.ledgerSettings?.timeZone != null
              ? { timeZone: snapshot.ledgerSettings.timeZone }
              : {})}
            readOnly
            collapseEntriesDefault={snapshot.ledgerSettings?.collapseEntriesDefault ?? false}
            offlineImageUrls={imageUrls}
          />
        </PullToRefresh>
      ) : activeTab === "details" ? (
        <OfflineDetails
          matches={matches}
          filters={effectiveFilters}
          setFilters={setNextFilters}
          snapshot={snapshot}
          mainCurrency={mainCurrency}
          locale={locale}
          onSelectDocument={setSelected}
          {...(statusText != null ? { syncStatus: statusText } : {})}
        />
      ) : activeTab === "stats" ? (
        <OfflineStats snapshot={snapshot} items={items} locale={locale} />
      ) : (
        <SnapshotState state="no-cache" zh={locale.startsWith("zh")} />
      )}

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
    </>
  );
}

function OfflineDetails({
  matches,
  filters,
  setFilters,
  snapshot,
  mainCurrency,
  locale,
  onSelectDocument,
  syncStatus,
}: {
  matches: ReturnType<typeof selectOfflineDocuments>;
  filters: EntryFilters;
  setFilters: (filters: EntryFilters) => void;
  snapshot: OfflineLedgerSnapshot;
  mainCurrency: string;
  locale: string;
  onSelectDocument: (document: SourceDocumentListItemDto) => void;
  syncStatus?: string;
}) {
  const entries = matches.flatMap((match) =>
    match.displayEntries.map((entry) => ({ ...entry, sourceDocument: match.document }))
  ) as LedgerEntry[];
  const { groupedItems } = useDetailsTabGrouping(
    entries,
    snapshot.ledgerSettings?.timeZone ?? undefined
  );
  return (
    <PullToRefresh
      onRefresh={async () => {}}
      header={
        <EntriesToolbarShell
          syncStatus={syncStatus}
          totalLabel={formatCurrencyAmount(totalOfflineMatches(matches), mainCurrency, locale)}
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
      }
    >
      <div className="space-y-6 pt-2">
        <LedgerEntryGroupsView
          groups={groupedItems}
          categories={snapshot.categories ?? []}
          mainCurrency={mainCurrency}
          onView={(entry) => {
            const document = matches.find(
              (item) => item.document.id === entry.sourceDocumentId
            )?.document;
            if (document != null) onSelectDocument(document);
          }}
        />
      </div>
    </PullToRefresh>
  );
}

function OfflineStats({
  snapshot,
  items,
  locale,
}: {
  snapshot: OfflineLedgerSnapshot;
  items: SourceDocumentListItemDto[];
  locale: string;
}) {
  const [rangeType, setRangeType] = useState<DateRangeType>(DEFAULT_STATS_RANGE_TYPE);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [chartView, setChartView] = useState<"trend" | "heatmap">("heatmap");
  const currency = snapshot.mainCurrency ?? "CNY";
  const todayKey = formatDateTimeForApi(new Date());
  const currentDate = useMemo(
    () => addPeriod(parseDateString(todayKey), rangeType, periodOffset),
    [periodOffset, rangeType, todayKey]
  );
  const range = useMemo(
    () => getStatsInitialQueryState(currentDate, rangeType),
    [currentDate, rangeType]
  );
  const label = useMemo(() => {
    switch (rangeType) {
      case "week":
        return `${formatCivilDate(range.startDateStr, locale, { month: "numeric", day: "numeric" })} - ${formatCivilDate(range.endDateStr, locale, { month: "numeric", day: "numeric" })}`;
      case "month":
        return formatCivilDate(range.startDateStr, locale, { year: "numeric", month: "long" });
      case "year":
        return formatCivilDate(range.startDateStr, locale, { year: "numeric" });
    }
  }, [locale, range.endDateStr, range.startDateStr, rangeType]);
  const stats = useMemo(
    () =>
      buildOfflineEnhancedStats({
        items,
        queryRange: { from: range.startDateStr, to: range.endDateStr },
        compareRange: { from: range.prevDateStartStr, to: range.prevDateEndStr },
        mainCurrency: currency,
        uncategorizedLabel: locale.startsWith("zh") ? "未分类" : "Uncategorized",
        today: todayKey,
      }),
    [currency, items, locale, range, todayKey]
  );

  return (
    <StatsContentView
      rangeType={rangeType}
      onRangeTypeChange={(nextRange) => {
        setRangeType(nextRange);
        setPeriodOffset(0);
      }}
      periodOffset={periodOffset}
      onPeriodOffsetChange={setPeriodOffset}
      label={label}
      startDate={range.startDate}
      endDate={range.endDate}
      startDateStr={range.startDateStr}
      endDateStr={range.endDateStr}
      stats={stats}
      chartView={chartView}
      onChartViewChange={setChartView}
      fallbackCurrency={currency}
    />
  );
}

function SnapshotState({ state, zh }: { state: LoadState; zh: boolean }) {
  const label =
    state === "loading"
      ? zh
        ? "正在读取本地账本"
        : "Loading local ledger"
      : state === "error"
        ? zh
          ? "无法读取本地缓存"
          : "Unable to read local cache"
        : state === "empty"
          ? zh
            ? "缓存中暂无单据"
            : "The local cache is empty"
          : zh
            ? "此账本还没有本地缓存"
            : "No local cache exists for this ledger";
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      {state === "loading" ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-info/25 border-t-info"
          aria-hidden
        />
      ) : null}
      <p className="text-sm">{label}</p>
    </div>
  );
}

function isStale(lastSyncedAt: string) {
  return Date.now() - Date.parse(lastSyncedAt) > 24 * 60 * 60 * 1000;
}

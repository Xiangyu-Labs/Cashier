"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { LedgerEntryCard } from "@/modules/ledger/ui/LedgerEntryCard";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocument,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { buildUnifiedStreamGroups } from "@/modules/source-document/stream-grouping";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";
import { EntriesToolbarShell } from "@/modules/workspace/ui/EntriesToolbarShell";
import { EntryGroupHeader } from "@/modules/workspace/ui/EntryGroupHeader";
import { STREAM_STATUS_PRESET_VALUES } from "@/modules/workspace/ledger-filter-state";
import { useConnectionState } from "./connection-state";
import { selectOfflineDocuments, totalOfflineMatches } from "./offline-selectors";
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
  const groups = new Map<string, { title: string; entries: LedgerEntry[]; total: Decimal }>();
  for (const match of matches) {
    for (const entry of match.displayEntries) {
      const key = entry.categoryId ?? "uncategorized";
      const group = groups.get(key) ?? {
        title: entry.category?.name ?? (locale.startsWith("zh") ? "未分类" : "Uncategorized"),
        entries: [],
        total: new Decimal(0),
      };
      group.entries.push({ ...entry, sourceDocument: match.document });
      group.total = group.total.plus(entry.convertedAmount ?? entry.amount);
      groups.set(key, group);
    }
  }
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
        {[...groups.entries()].map(([key, group]) => (
          <div key={key} className="space-y-2">
            <EntryGroupHeader
              title={group.title}
              totalLabel={formatCurrencyAmount(group.total.toNumber(), mainCurrency, locale)}
            />
            <div className="space-y-4 px-2">
              {group.entries.map((entry) => (
                <LedgerEntryCard
                  key={entry.id}
                  ledgerEntry={entry}
                  categories={snapshot.categories ?? []}
                  mainCurrency={mainCurrency}
                  onView={() => {
                    const document = matches.find(
                      (item) => item.document.id === entry.sourceDocumentId
                    )?.document;
                    if (document != null) onSelectDocument(document);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
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
  const matches = selectOfflineDocuments(items, { statuses: ["completed"] });
  const byCategory = new Map<string, { name: string; total: Decimal; count: number }>();
  for (const match of matches) {
    for (const entry of match.displayEntries) {
      const key = entry.categoryId ?? "uncategorized";
      const current = byCategory.get(key) ?? {
        name: entry.category?.name ?? (locale.startsWith("zh") ? "未分类" : "Uncategorized"),
        total: new Decimal(0),
        count: 0,
      };
      current.total = current.total.plus(entry.convertedAmount ?? entry.amount);
      current.count += 1;
      byCategory.set(key, current);
    }
  }
  const currency = snapshot.mainCurrency ?? "CNY";
  const dailyTotals = new Map<string, Decimal>();
  for (const match of matches) {
    const date = match.document.entryDate ?? match.document.createdAt.slice(0, 10);
    dailyTotals.set(date, (dailyTotals.get(date) ?? new Decimal(0)).plus(match.subtotal));
  }
  const monthlyTotals = new Map<string, Decimal>();
  for (const [date, total] of dailyTotals) {
    const month = date.slice(0, 7);
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? new Decimal(0)).plus(total));
  }
  const trend = [...monthlyTotals.entries()].toSorted(([a], [b]) => a.localeCompare(b)).slice(-6);
  const maxMonth = trend.reduce((max, [, total]) => Decimal.max(max, total), new Decimal(0));
  const heatmapDays = buildHeatmapDays(dailyTotals);
  const maxDay = heatmapDays.reduce((max, { total }) => Decimal.max(max, total), new Decimal(0));
  return (
    <div className="space-y-6 px-2 pb-24">
      <section className="border-b border-border py-5">
        <p className="text-xs text-muted-foreground">
          {locale.startsWith("zh") ? "缓存支出合计" : "Cached expense total"}
        </p>
        <p className="mt-1 text-3xl font-semibold text-text">
          {formatCurrencyAmount(totalOfflineMatches(matches), currency, locale)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {new Date(snapshot.lastSyncedAt).toLocaleString(locale)}
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">
          {locale.startsWith("zh") ? "分类" : "Categories"}
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {[...byCategory.entries()]
            .sort((a, b) => b[1].total.comparedTo(a[1].total))
            .map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {value.name} <span className="text-muted-foreground">({value.count})</span>
                </span>
                <span className="font-medium">
                  {formatCurrencyAmount(value.total.toNumber(), currency, locale)}
                </span>
              </div>
            ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">
          {locale.startsWith("zh") ? "月度趋势" : "Monthly trend"}
        </h2>
        <div className="space-y-3 border-y border-border py-3">
          {trend.map(([month, total]) => (
            <div
              key={month}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            >
              <span className="text-muted-foreground">{month}</span>
              <div className="h-2 overflow-hidden rounded-sm bg-surface2">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${maxMonth.isZero() ? 0 : total.div(maxMonth).times(100).toNumber()}%`,
                  }}
                />
              </div>
              <span className="font-medium text-text">
                {formatCurrencyAmount(total.toNumber(), currency, locale)}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">
          {locale.startsWith("zh") ? "最近 35 天" : "Latest 35 days"}
        </h2>
        <div
          className="grid grid-cols-7 gap-1.5"
          role="img"
          aria-label={locale.startsWith("zh") ? "每日支出热力图" : "Daily expense heatmap"}
        >
          {heatmapDays.map(({ date, total }) => (
            <div
              key={date}
              className="aspect-square min-w-0 rounded-sm border border-border bg-primary"
              style={{
                opacity: total.isZero()
                  ? 0.08
                  : 0.2 + (maxDay.isZero() ? 0 : total.div(maxDay).times(0.8).toNumber()),
              }}
              title={`${date}: ${formatCurrencyAmount(total.toNumber(), currency, locale)}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function buildHeatmapDays(dailyTotals: ReadonlyMap<string, Decimal>) {
  const latest = [...dailyTotals.keys()].toSorted().at(-1) ?? new Date().toISOString().slice(0, 10);
  const cursor = new Date(`${latest}T00:00:00Z`);
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() - (34 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, total: dailyTotals.get(key) ?? new Decimal(0) };
  });
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

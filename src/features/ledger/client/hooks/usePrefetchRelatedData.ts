"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";
import { getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getAllSourceDocumentsAction } from "@/features/source-document/server/actions";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { formatDateTimeForApi, type DateRangeType, getDateRange, addPeriod } from "@/lib/date-utils";
import { periodToDateRange, type PeriodParams } from "@/lib/period-utils";
import type { Ledger, EntryCategory } from "@/types/api";

interface PrefetchOptions {
  ledgerId: string;
  activeTab: "history" | "details" | "stats" | "settings";
  ledger?: Ledger;
  categories: EntryCategory[];
  periodParams: PeriodParams;
}

const PREFETCH_DELAY = 1500; // 1.5秒后启动预加载
const STALE_TIME = 5 * 60 * 1000; // 5分钟

export function usePrefetchRelatedData({
  ledgerId,
  activeTab,
  ledger,
  categories,
  periodParams,
}: PrefetchOptions) {
  const queryClient = useQueryClient();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Tab 级预加载（现有逻辑）
  useEffect(() => {
    // 取消之前的定时器和请求
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 abort controller
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    console.log(`[Prefetch] useEffect triggered for tab: ${activeTab}, ledger: ${ledgerId.slice(0, 8)}`);

    // 延迟启动预加载
    timerRef.current = setTimeout(() => {
      if (signal.aborted) {
        console.log('[Prefetch] Aborted before prefetch start');
        return;
      }

      console.log(`[Prefetch] Starting prefetch after ${PREFETCH_DELAY}ms delay`);

      // 使用 requestIdleCallback 在浏览器空闲时执行
      const schedulePrefetch = typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

      schedulePrefetch(() => {
        if (signal.aborted) {
          console.log('[Prefetch] Aborted in requestIdleCallback');
          return;
        }
        console.log(`[Prefetch] Executing prefetch for ${activeTab} tab`);
        prefetchRelatedData({
          queryClient,
          ledgerId,
          activeTab,
          ledger,
          categories,
          periodParams,
          signal,
        });
      });
    }, PREFETCH_DELAY);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [ledgerId, activeTab, ledger, ledger?.id, categories, periodParams, queryClient]);
}

interface PrefetchContext {
  queryClient: ReturnType<typeof useQueryClient>;
  ledgerId: string;
  activeTab: "history" | "details" | "stats" | "settings";
  ledger?: Ledger;
  categories: EntryCategory[];
  periodParams: PeriodParams;
  signal: AbortSignal;
}

async function prefetchRelatedData(ctx: PrefetchContext) {
  const { activeTab } = ctx;
  console.log(`[Prefetch] prefetchRelatedData called for activeTab: ${activeTab}`);

  switch (activeTab) {
    case "history":
      console.log('[Prefetch] Will prefetch: Details, Stats, Settings tabs');
      await prefetchDetailsTab(ctx);
      await prefetchStatsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "details":
      console.log('[Prefetch] Will prefetch: History, Stats, Settings tabs');
      await prefetchHistoryTab(ctx);
      await prefetchStatsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "stats":
      console.log('[Prefetch] Will prefetch: History, Details, Settings tabs');
      await prefetchHistoryTab(ctx);
      await prefetchDetailsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "settings":
      console.log('[Prefetch] Will prefetch: History, Details, Stats tabs');
      await prefetchHistoryTab(ctx);
      await prefetchDetailsTab(ctx);
      await prefetchStatsTab(ctx);
      break;
  }
  console.log(`[Prefetch] prefetchRelatedData completed for ${activeTab}`);
}

// 预加载 History Tab 数据
async function prefetchHistoryTab({
  queryClient,
  ledgerId,
  periodParams,
  signal,
}: PrefetchContext) {
  if (signal.aborted) {
    console.log('[Prefetch] prefetchHistoryTab aborted');
    return;
  }

  console.log('[Prefetch] Starting prefetchHistoryTab');
  const startTime = Date.now();

  const { startDate, endDate } = periodToDateRange(periodParams);

  // 预加载源单据列表
  const sourceDocsKey = queryKeys.sourceDocuments(ledgerId, "all", startDate, endDate);
  const cached = queryClient.getQueryData(sourceDocsKey);
  console.log(`[Prefetch] HistoryTab - sourceDocuments cache check: ${cached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!cached) {
    console.log('[Prefetch] HistoryTab - fetching sourceDocuments...');
    await queryClient.prefetchQuery({
      queryKey: sourceDocsKey,
      queryFn: () => getAllSourceDocumentsAction(ledgerId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
      staleTime: STALE_TIME,
    });
    console.log(`[Prefetch] HistoryTab - sourceDocuments fetched in ${Date.now() - startTime}ms`);
  }
}

// 预加载 Details Tab 数据
async function prefetchDetailsTab({
  queryClient,
  ledgerId,
  periodParams,
  ledger,
  signal,
}: PrefetchContext) {
  if (signal.aborted) {
    console.log('[Prefetch] prefetchDetailsTab aborted');
    return;
  }

  console.log('[Prefetch] Starting prefetchDetailsTab');
  const startTime = Date.now();

  const { startDate, endDate } = periodToDateRange(periodParams);
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

  // 预加载账本条目汇总数据
  const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDate, endDate, mainCurrency, null);
  const summaryCached = queryClient.getQueryData(summaryKey);
  console.log(`[Prefetch] DetailsTab - summary cache check: ${summaryCached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!summaryCached) {
    console.log('[Prefetch] DetailsTab - fetching summary...');
    await queryClient.prefetchQuery({
      queryKey: summaryKey,
      queryFn: () => getLedgerStatsAction(
        ledgerId,
        startDate || undefined,
        endDate || undefined,
        mainCurrency,
        undefined
      ),
      staleTime: STALE_TIME,
    });
    console.log(`[Prefetch] DetailsTab - summary fetched`);
  }

  if (signal.aborted) {
    console.log('[Prefetch] prefetchDetailsTab aborted after summary');
    return;
  }

  // 预加载账本条目第一页
  const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDate, endDate, null);
  const entriesCached = queryClient.getQueryData(entriesKey);
  console.log(`[Prefetch] DetailsTab - entries cache check: ${entriesCached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!entriesCached) {
    console.log('[Prefetch] DetailsTab - fetching entries...');
    await queryClient.prefetchInfiniteQuery({
      queryKey: entriesKey,
      queryFn: ({ pageParam }) => getLedgerEntriesAction(ledgerId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        cursor: pageParam,
        limit: 50,
      }),
      initialPageParam: undefined as string | undefined,
      staleTime: STALE_TIME,
    });
    console.log(`[Prefetch] DetailsTab - entries fetched`);
  }

  console.log(`[Prefetch] DetailsTab completed in ${Date.now() - startTime}ms`);
}

// 预加载 Stats Tab 数据（仅当前月份）
async function prefetchStatsTab({
  queryClient,
  ledgerId,
  ledger,
  signal,
}: PrefetchContext) {
  if (signal.aborted || !ledger) {
    console.log(`[Prefetch] prefetchStatsTab ${signal.aborted ? 'aborted' : 'skipped (no ledger)'}`);
    return;
  }

  console.log('[Prefetch] Starting prefetchStatsTab');

  const mainCurrency = ledger.metadata?.settings?.mainCurrency || "CNY";
  const monthStartDay = ledger.metadata?.settings?.monthStartDay || 1;

  // 只预加载当前月份（1个周期），不再预加载左右月份
  // 从 28 次请求（4 rangeTypes × 7 周期）减少到 1 次请求
  const rangeType: DateRangeType = "month";
  const centerDate = new Date();

  const range = getDateRange(centerDate, rangeType, monthStartDay);
  const startStr = formatDateTimeForApi(range.startDate);
  const endStr = formatDateTimeForApi(range.endDate);

  // 计算对比周期（前一个周期）
  const prevDate = addPeriod(centerDate, rangeType, -1);
  const prevRange = getDateRange(prevDate, rangeType, monthStartDay);
  const prevStartStr = formatDateTimeForApi(prevRange.startDate);
  const prevEndStr = formatDateTimeForApi(prevRange.endDate);

  const statsKey = [...queryKeys.enhancedStats(ledgerId), startStr, rangeType, mainCurrency];
  const cached = queryClient.getQueryData(statsKey);
  console.log(`[Prefetch] StatsTab - enhancedStats cache check: ${cached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!cached) {
    console.log('[Prefetch] StatsTab - fetching enhancedStats...');
    await queryClient.prefetchQuery({
      queryKey: statsKey,
      queryFn: () => getEnhancedStats({
        ledgerId,
        queryRange: { from: startStr, to: endStr },
        compareRange: { from: prevStartStr, to: prevEndStr },
      }),
      staleTime: STALE_TIME,
    });
    console.log('[Prefetch] StatsTab - enhancedStats fetched');
  }
}

// 预加载 Settings Tab 数据
async function prefetchSettingsTab({
  queryClient,
  ledgerId,
  categories,
  signal,
}: PrefetchContext) {
  if (signal.aborted) {
    console.log('[Prefetch] prefetchSettingsTab aborted');
    return;
  }

  console.log('[Prefetch] Starting prefetchSettingsTab');

  // 预加载账本设置
  const settingsKey = queryKeys.ledgerSettings(ledgerId);
  const settingsCached = queryClient.getQueryData(settingsKey);
  console.log(`[Prefetch] SettingsTab - settings cache check: ${settingsCached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!settingsCached) {
    console.log('[Prefetch] SettingsTab - fetching settings...');
    await queryClient.prefetchQuery({
      queryKey: settingsKey,
      queryFn: () => getLedgerSettingsAction(ledgerId),
      staleTime: STALE_TIME,
    });
    console.log('[Prefetch] SettingsTab - settings fetched');
  }

  if (signal.aborted) {
    console.log('[Prefetch] prefetchSettingsTab aborted after settings');
    return;
  }

  // 预加载服务凭证
  const credentialsKey = queryKeys.serviceCredentials(ledgerId);
  const credentialsCached = queryClient.getQueryData(credentialsKey);
  console.log(`[Prefetch] SettingsTab - credentials cache check: ${credentialsCached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!credentialsCached) {
    console.log('[Prefetch] SettingsTab - fetching credentials...');
    await queryClient.prefetchQuery({
      queryKey: credentialsKey,
      queryFn: () => getServiceCredentialsAction(ledgerId),
      staleTime: STALE_TIME,
    });
    console.log('[Prefetch] SettingsTab - credentials fetched');
  }

  if (signal.aborted) {
    console.log('[Prefetch] prefetchSettingsTab aborted after credentials');
    return;
  }

  // 预加载所有账本（用于切换）
  const ledgersKey = queryKeys.ledgers();
  const ledgersCached = queryClient.getQueryData(ledgersKey);
  console.log(`[Prefetch] SettingsTab - ledgers cache check: ${ledgersCached ? 'HIT (skip)' : 'MISS (fetch)'}`);

  if (!ledgersCached) {
    console.log('[Prefetch] SettingsTab - fetching ledgers...');
    await queryClient.prefetchQuery({
      queryKey: ledgersKey,
      queryFn: () => getLedgersAction(),
      staleTime: STALE_TIME,
    });
    console.log('[Prefetch] SettingsTab - ledgers fetched');
  }

  if (signal.aborted) {
    console.log('[Prefetch] prefetchSettingsTab aborted after ledgers');
    return;
  }

  // 预加载分类（如果还没有）
  const categoriesKey = queryKeys.entryCategories(ledgerId);
  const categoriesCached = queryClient.getQueryData(categoriesKey);
  console.log(`[Prefetch] SettingsTab - categories cache check: cached=${!!categoriesCached}, length=${categories.length}`);

  if (!categoriesCached && categories.length === 0) {
    console.log('[Prefetch] SettingsTab - fetching categories...');
    await queryClient.prefetchQuery({
      queryKey: categoriesKey,
      queryFn: () => getEntryCategoriesAction(ledgerId),
      staleTime: STALE_TIME,
    });
    console.log('[Prefetch] SettingsTab - categories fetched');
  }

  console.log('[Prefetch] SettingsTab completed');
}


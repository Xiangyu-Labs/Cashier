"use client";

import { useEffect, useRef, useMemo } from "react";
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

  // 稳定化依赖，避免不必要的 effect 重置
  // 使用原始值而非对象引用，确保只在实际数据变化时重新触发
  const stableDeps = useMemo(() => ({
    ledgerId,
    activeTab,
    ledgerIdFromLedger: ledger?.id,
    mainCurrency: ledger?.metadata?.settings?.mainCurrency,
    period: periodParams.period,
    startDate: periodParams.startDate,
    endDate: periodParams.endDate,
    monthStartDay: periodParams.monthStartDay,
    categoryCount: categories.length,
  }), [ledgerId, activeTab, ledger?.id, ledger?.metadata?.settings?.mainCurrency, periodParams.period, periodParams.startDate, periodParams.endDate, periodParams.monthStartDay, categories.length]);

  // Tab 级预加载
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

    // 延迟启动预加载
    timerRef.current = setTimeout(() => {
      if (signal.aborted) {
        return;
      }

      // 使用 requestIdleCallback 在浏览器空闲时执行
      const schedulePrefetch = typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

      schedulePrefetch(() => {
        if (signal.aborted) {
          return;
        }
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
    // 使用稳定化的依赖，避免不必要的重新触发
  }, [stableDeps, queryClient]);
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

  switch (activeTab) {
    case "history":
      await prefetchDetailsTab(ctx);
      await prefetchStatsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "details":
      await prefetchHistoryTab(ctx);
      await prefetchStatsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "stats":
      await prefetchHistoryTab(ctx);
      await prefetchDetailsTab(ctx);
      await prefetchSettingsTab(ctx);
      break;
    case "settings":
      await prefetchHistoryTab(ctx);
      await prefetchDetailsTab(ctx);
      await prefetchStatsTab(ctx);
      break;
  }
}

// 预加载 History Tab 数据
async function prefetchHistoryTab({
  queryClient,
  ledgerId,
  periodParams,
  signal,
}: PrefetchContext) {
  if (signal.aborted) {
    return;
  }

  const { startDate, endDate } = periodToDateRange(periodParams);

  // 预加载源单据列表
  const sourceDocsKey = queryKeys.sourceDocuments(ledgerId, "all", startDate, endDate);
  const cached = queryClient.getQueryData(sourceDocsKey);

  if (!cached) {
    await queryClient.prefetchQuery({
      queryKey: sourceDocsKey,
      queryFn: () => getAllSourceDocumentsAction(ledgerId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
      staleTime: STALE_TIME,
    });
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
    return;
  }

  const { startDate, endDate } = periodToDateRange(periodParams);
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

  // 预加载账本条目汇总数据（不使用 filterKey，确保与实际组件 query key 一致）
  const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDate, endDate, mainCurrency);
  const summaryCached = queryClient.getQueryData(summaryKey);

  if (!summaryCached) {
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
  }

  if (signal.aborted) {
    return;
  }

  // 预加载账本条目第一页（不使用 filterKey，确保与实际组件 query key 一致）
  const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDate, endDate);
  const entriesCached = queryClient.getQueryData(entriesKey);

  if (!entriesCached) {
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
  }
}

// 预加载 Stats Tab 数据（仅当前月份）
async function prefetchStatsTab({
  queryClient,
  ledgerId,
  ledger,
  signal,
}: PrefetchContext) {
  if (signal.aborted || !ledger) {
    return;
  }

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

  if (!cached) {
    await queryClient.prefetchQuery({
      queryKey: statsKey,
      queryFn: () => getEnhancedStats({
        ledgerId,
        queryRange: { from: startStr, to: endStr },
        compareRange: { from: prevStartStr, to: prevEndStr },
      }),
      staleTime: STALE_TIME,
    });
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
    return;
  }

  // 预加载账本设置
  const settingsKey = queryKeys.ledgerSettings(ledgerId);
  const settingsCached = queryClient.getQueryData(settingsKey);

  if (!settingsCached) {
    await queryClient.prefetchQuery({
      queryKey: settingsKey,
      queryFn: () => getLedgerSettingsAction(ledgerId),
      staleTime: STALE_TIME,
    });
  }

  if (signal.aborted) {
    return;
  }

  // 预加载服务凭证
  const credentialsKey = queryKeys.serviceCredentials(ledgerId);
  const credentialsCached = queryClient.getQueryData(credentialsKey);

  if (!credentialsCached) {
    await queryClient.prefetchQuery({
      queryKey: credentialsKey,
      queryFn: () => getServiceCredentialsAction(ledgerId),
      staleTime: STALE_TIME,
    });
  }

  if (signal.aborted) {
    return;
  }

  // 预加载所有账本（用于切换）
  const ledgersKey = queryKeys.ledgers();
  const ledgersCached = queryClient.getQueryData(ledgersKey);

  if (!ledgersCached) {
    await queryClient.prefetchQuery({
      queryKey: ledgersKey,
      queryFn: () => getLedgersAction(),
      staleTime: STALE_TIME,
    });
  }

  if (signal.aborted) {
    return;
  }

  // 预加载分类（如果还没有）
  const categoriesKey = queryKeys.entryCategories(ledgerId);
  const categoriesCached = queryClient.getQueryData(categoriesKey);

  if (!categoriesCached && categories.length === 0) {
    await queryClient.prefetchQuery({
      queryKey: categoriesKey,
      queryFn: () => getEntryCategoriesAction(ledgerId),
      staleTime: STALE_TIME,
    });
  }
}


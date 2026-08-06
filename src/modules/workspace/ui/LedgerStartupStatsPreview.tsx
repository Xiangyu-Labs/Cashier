"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  addPeriod,
  formatCivilDate,
  formatDateTimeForApi,
  parseDateString,
  type DateRangeType,
} from "@/lib/date-utils";
import { StatsContentView } from "@/modules/stats/ui";
import {
  DEFAULT_STATS_RANGE_TYPE,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";
import { buildCachedEnhancedStats } from "@/modules/workspace/ledger-startup-cache-selectors";

interface LedgerStartupStatsPreviewProps {
  snapshot: LedgerStartupCacheSnapshot;
}

export function LedgerStartupStatsPreview({ snapshot }: LedgerStartupStatsPreviewProps) {
  const locale = useLocale();
  const t = useTranslations("StatsTab");
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
    () =>
      getStatsInitialQueryState(currentDate, rangeType, {
        currentPeriod: periodOffset === 0,
      }),
    [currentDate, periodOffset, rangeType]
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
      buildCachedEnhancedStats({
        items: snapshot.items,
        queryRange: { from: range.startDateStr, to: range.endDateStr },
        compareRange: { from: range.prevDateStartStr, to: range.prevDateEndStr },
        mainCurrency: currency,
        uncategorizedLabel: t("uncategorized"),
        comparisonMode: range.mode,
      }),
    [currency, range, snapshot.items, t]
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

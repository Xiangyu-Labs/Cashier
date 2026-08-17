"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DateRangeType } from "@/lib/date-utils";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";

interface StatsHeaderProps {
  rangeType: DateRangeType;
  setRangeType: (type: DateRangeType) => void;
  periodOffset: number;
  setPeriodOffset: (offset: number) => void;
  label: string;
  totalExpense: number;
  averageDaily: number;
  currencySymbol?: string;
  comparison?: EnhancedStatsDto["summary"]["comparison"];
  periodLabel?: string;
  trend?: {
    percent: number;
    amount: number;
  };
  readOnly?: boolean;
  isLoading?: boolean;
}

export function StatsHeader({
  rangeType,
  setRangeType,
  periodOffset,
  setPeriodOffset,
  label,
  totalExpense,
  averageDaily,
  currencySymbol = "CNY",
  comparison,
  periodLabel,
  trend,
  readOnly = false,
  isLoading = false,
}: StatsHeaderProps) {
  const t = useTranslations("StatsTab");
  const locale = useLocale();
  const handlePrev = () => setPeriodOffset(periodOffset - 1);
  const handleNext = () => setPeriodOffset(Math.min(0, periodOffset + 1));
  const canGoNext = periodOffset < 0;

  // Same-period comparison is the primary metric; the legacy trend object is
  // only a fallback while old cached payloads drain out.
  const delta = comparison != null ? Number(comparison.amountDelta) : (trend?.amount ?? 0);
  const percentValue = comparison != null ? comparison.percent : (trend?.percent ?? 0);
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;
  const absPercent = Math.abs(percentValue).toFixed(1);
  const amountLabel = formatCurrencyAmount(Math.abs(delta), currencySymbol, locale);
  const comparisonMode = comparison?.mode ?? "same_period";
  const comparisonValues = {
    period: periodLabel ?? "",
    amount: amountLabel,
    percent: absPercent,
  };
  const comparisonText =
    comparisonMode === "same_period"
      ? delta === 0
        ? t("samePeriodEqual", comparisonValues)
        : isIncrease
          ? t("samePeriodMore", comparisonValues)
          : t("samePeriodLess", comparisonValues)
      : delta === 0
        ? t("fullPeriodEqual", comparisonValues)
        : isIncrease
          ? t("fullPeriodMore", comparisonValues)
          : t("fullPeriodLess", comparisonValues);
  const rangeLabel = (type: DateRangeType) => {
    switch (type) {
      case "week":
        return t("week");
      case "month":
        return t("month");
      case "year":
        return t("year");
    }
  };

  return (
    <div className="flex flex-col gap-6 bg-surface">
      {/* 1. Date Range Switcher (Segmented Control) */}
      <div className="flex w-full items-center justify-center gap-2">
        <div className="flex p-1 bg-surface2 rounded-lg w-full max-w-xs">
          {(["week", "month", "year"] as DateRangeType[]).map((type) => (
            <button
              type="button"
              key={type}
              onClick={() => {
                setRangeType(type);
              }}
              aria-pressed={rangeType === type}
              disabled={readOnly}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]",
                rangeType === type
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted-foreground hover:text-text"
              )}
            >
              {rangeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Date Navigator */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={readOnly}
            aria-label={t("previousPeriod")}
            className="p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-lg font-semibold min-w-[8rem] text-center tabular-nums">{label}</div>
          <button
            type="button"
            onClick={handleNext}
            disabled={readOnly || !canGoNext}
            aria-label={t("nextPeriod")}
            className={cn(
              "p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors",
              !canGoNext &&
                "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
            )}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        {periodOffset === 0 ? (
          <span className="text-xs text-muted-foreground">{t("throughToday")}</span>
        ) : null}
      </div>

      {/* 3. Summary Stats */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-muted-foreground">{t("totalExpense")}</div>
        {isLoading ? (
          <div className="h-10 w-36 animate-pulse rounded bg-surface2" aria-hidden />
        ) : (
          <AmountText variant="hero">
            {formatCurrencyAmount(totalExpense, currencySymbol, locale)}
          </AmountText>
        )}

        {/* Comparison Section */}
        {!isLoading && (comparison != null || trend != null) && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full mt-1",
              isIncrease
                ? "bg-destructive/10 text-destructive"
                : isDecrease
                  ? "bg-primary/10 text-primary"
                  : "bg-surface2 text-muted-foreground"
            )}
          >
            <span>
              {comparison != null
                ? comparisonText
                : `${isIncrease ? "+" : isDecrease ? "-" : ""}${absPercent}% ${t("vsPreviousPeriod")}`}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="mt-1 h-4 w-28 animate-pulse rounded bg-surface2" aria-hidden />
        ) : (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            {t("averageDaily")}{" "}
            <AmountText variant="secondary">
              {formatCurrencyAmount(averageDaily, currencySymbol, locale)}
            </AmountText>
          </div>
        )}
      </div>
    </div>
  );
}

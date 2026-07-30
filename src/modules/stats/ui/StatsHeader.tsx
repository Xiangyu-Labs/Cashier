"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DateRangeType } from "@/lib/date-utils";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";

interface StatsHeaderProps {
  rangeType: DateRangeType;
  setRangeType: (type: DateRangeType) => void;
  periodOffset: number;
  setPeriodOffset: (offset: number) => void;
  label: string;
  totalExpense: number;
  averageDaily: number;
  currencySymbol?: string;
  trend?: {
    percent: number;
    amount: number;
  };
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
  trend,
}: StatsHeaderProps) {
  const t = useTranslations("StatsTab");
  const locale = useLocale();
  const handlePrev = () => setPeriodOffset(periodOffset - 1);
  const handleNext = () => setPeriodOffset(Math.min(0, periodOffset + 1));
  const canGoNext = periodOffset < 0;

  // Trend Logic: Expense Increase = Bad (Red/Danger), Decrease = Good (Green/Primary)
  // But color perception varies. Let's use:
  // Increase: destructive (Red)
  // Decrease: primary (Green/Brand)
  const isIncrease = trend && trend.amount > 0;
  const isDecrease = trend && trend.amount < 0;

  // Formatting trend percent
  const trendPercent = trend ? Math.abs(trend.percent).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col gap-6 bg-surface">
      {/* 1. Date Range Switcher (Segmented Control) */}
      <div className="flex p-1 bg-surface2 rounded-lg self-center w-full max-w-xs">
        {(["week", "month", "year"] as DateRangeType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              setRangeType(type);
            }}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]",
              rangeType === type
                ? "bg-surface text-primary shadow-sm"
                : "text-muted-foreground hover:text-text"
            )}
          >
            {t(type)}
          </button>
        ))}
      </div>

      {/* 2. Date Navigator */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrev}
            className="p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-lg font-semibold min-w-[8rem] text-center tabular-nums">{label}</div>
          <button
            onClick={handleNext}
            disabled={!canGoNext}
            className={cn(
              "p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors",
              !canGoNext &&
                "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
            )}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* 3. Summary Stats */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-muted-foreground">{t("totalExpense")}</div>
        <AmountText variant="hero">
          {formatCurrencyAmount(totalExpense, currencySymbol, locale)}
        </AmountText>

        {/* Trend Section */}
        {trend && (
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
              {isIncrease ? "+" : isDecrease ? "-" : ""}
              {trendPercent}% {t("vsPreviousPeriod")}
            </span>
          </div>
        )}

        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
          {t("averageDaily")}{" "}
          <AmountText variant="secondary">
            {formatCurrencyAmount(averageDaily, currencySymbol, locale)}
          </AmountText>
        </div>
      </div>
    </div>
  );
}

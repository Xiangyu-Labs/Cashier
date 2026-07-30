"use client";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/modules/workspace/ui/EmptyState";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";

interface CategoryStat {
  id: string | null;
  name: string;
  icon: string | null;
  totalConverted: number; // Converted Amount
  percent: number; // % of total
  count: number;
  trend?: {
    percent: number;
    amount: number;
  };
}

interface StatsRankingProps {
  data: CategoryStat[];
  isLoading?: boolean;
  currencySymbol?: string;
  onCategoryClick?: (categoryId: string) => void;
}

export function StatsRanking({
  data,
  isLoading,
  currencySymbol = "CNY",
  onCategoryClick,
}: StatsRankingProps) {
  const t = useTranslations("StatsTab");
  const locale = useLocale();

  if (isLoading) {
    return (
      <div className="space-y-5 px-2">
        {/* "支出排行" title */}
        <div className="h-6 w-24 bg-surface2/50 rounded animate-pulse" />

        {/* Category items */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            {/* Icon circle */}
            <div className="w-10 h-10 rounded-full bg-surface2/50 animate-pulse shrink-0" />
            {/* Content */}
            <div className="flex-1 space-y-1.5">
              {/* Top line: Name + Amount */}
              <div className="flex justify-between items-center">
                <div className="h-4 w-16 bg-surface2/50 rounded animate-pulse" />
                <div className="h-4 w-20 bg-surface2/50 rounded animate-pulse font-mono" />
              </div>
              {/* Bottom line: Progress bar + percent */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-surface2/50 rounded-full animate-pulse" />
                <div className="h-3 w-12 bg-surface2/50 rounded animate-pulse shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={t("noStats")} description={t("noStatsDesc")} />;
  }

  // Sort descending by converted amount
  const sorted = [...data].sort((a, b) => b.totalConverted - a.totalConverted);

  return (
    <div className="space-y-5 px-2">
      <h3 className="font-semibold text-lg flex items-center gap-2">{t("expenseRanking")}</h3>

      <div className="space-y-5">
        {sorted.map((cat, idx) => {
          const percent = cat.percent;
          const handleClick = () => {
            if (onCategoryClick) {
              // Use "__uncategorized__" for null ids to match DetailsTab convention
              onCategoryClick(cat.id ?? "__uncategorized__");
            }
          };
          return (
            <button
              type="button"
              key={idx}
              disabled={onCategoryClick == null}
              aria-label={`${cat.name}, ${formatCurrencyAmount(cat.totalConverted, currencySymbol, locale)}, ${percent.toFixed(0)}%`}
              className={cn(
                "flex w-full items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                onCategoryClick &&
                  "cursor-pointer hover:bg-surface2/50 rounded-lg -mx-2 px-2 py-1 transition-colors"
              )}
              onClick={handleClick}
            >
              {/* Icon Circle */}
              <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-lg shrink-0 group-hover:bg-primary/10 transition-colors">
                <CategoryIcon
                  iconName={cat.icon}
                  className="w-5 h-5 text-text/80 group-hover:text-primary transition-colors"
                />
              </div>

              {/* Content */}
              <div className="flex-1 space-y-1.5">
                {/* Top Line: Name + Amount */}
                <div className="flex justify-between items-center text-sm">
                  <div className="font-medium text-text">{cat.name}</div>
                  <AmountText variant="item">
                    {formatCurrencyAmount(cat.totalConverted, currencySymbol, locale)}
                  </AmountText>
                </div>

                {/* Bottom Line: Progress + Detail */}
                <div className="flex items-center gap-3">
                  {/* Progress Bar */}
                  <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full origin-left rounded-full bg-primary transition-transform duration-[var(--motion-expand)] ease-[var(--motion-enter)]"
                      style={{ transform: `scaleX(${percent / 100})` }}
                    />
                  </div>

                  {/* Stats Detail */}
                  <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
                    <span className="tabular-nums">{percent.toFixed(0)}%</span>
                    {/* Show trend if significant */}
                    {cat.trend && Math.abs(cat.trend.percent) > 10 && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5",
                          cat.trend.amount > 0 ? "text-destructive" : "text-primary"
                        )}
                      >
                        <AmountText variant="secondary">
                          {formatCurrencyAmount(
                            Math.abs(cat.trend.amount),
                            currencySymbol,
                            locale,
                            {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            }
                          )}
                        </AmountText>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

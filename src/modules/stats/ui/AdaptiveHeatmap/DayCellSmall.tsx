/**
 * Small Day Cell (12px) with tooltip
 * GitHub-style contribution cell
 */

"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getHeatmapColor, formatCellAmount } from "../../lib/heatmap-colors";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapLevel } from "../../types";
import { compare } from "@/lib/money/decimal";

interface DayCellSmallProps {
  date: string;
  amount: string;
  count: number;
  level: HeatmapLevel;
  onClick?: () => void;
  currency?: string;
  locale?: string;
}

export function DayCellSmall({
  date,
  amount,
  count,
  level,
  onClick,
  currency = "CNY",
  locale = "zh-CN",
}: DayCellSmallProps) {
  const t = useTranslations("Calendar");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${date}, ${compare(amount, "0") > 0 ? `${t("expense")}: ${formatCellAmount(amount, currency, locale)}` : t("noConsumption")}`}
          onClick={onClick}
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]",
            "hover:ring-1 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          <span
            aria-hidden
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: getHeatmapColor(level) }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <div className="font-medium">{date}</div>
        {compare(amount, "0") > 0 ? (
          <>
            <div>
              {t("expense")}: {formatCellAmount(amount, currency, locale)}
            </div>
            <div>{t("count", { count })}</div>
          </>
        ) : (
          <div className="text-muted-foreground">{t("noConsumption")}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

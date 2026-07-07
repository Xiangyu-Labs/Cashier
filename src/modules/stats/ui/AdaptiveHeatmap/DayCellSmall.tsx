/**
 * Small Day Cell (12px) with tooltip
 * GitHub-style contribution cell
 */

"use client";
import { useTranslations } from "next-intl";
import { getHeatmapColor, formatCellAmount } from "../../lib/heatmap-colors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapLevel } from "../../types";

interface DayCellSmallProps {
  date: string;
  amount: number;
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={
              amount > 0
                ? `${date} ${t("expense")}: ${formatCellAmount(amount, currency, locale)}, ${t("count", { count })}`
                : `${date} ${t("noConsumption")}`
            }
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-sm sm:h-3 sm:w-3"
              style={{ backgroundColor: getHeatmapColor(level) }}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
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
    </TooltipProvider>
  );
}

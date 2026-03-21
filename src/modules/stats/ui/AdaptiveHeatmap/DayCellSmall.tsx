/**
 * Small Day Cell (12px) with tooltip
 * GitHub-style contribution cell
 */

"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getHeatmapColor, formatCellAmount } from "../../lib/heatmap-colors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapLevel } from "../../types";

interface DayCellSmallProps {
  date: string;
  amount: number;
  count: number;
  level: HeatmapLevel;
  onClick?: () => void;
}

export function DayCellSmall({ date, amount, count, level, onClick }: DayCellSmallProps) {
  const t = useTranslations("Calendar");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "w-3 h-3 rounded-sm transition-all duration-150 flex-shrink-0",
              "hover:scale-125 hover:ring-1 hover:ring-primary/50 focus:outline-none focus:ring-1 focus:ring-primary"
            )}
            style={{
              backgroundColor: getHeatmapColor(level),
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <>
              <div>
                {t("expense")}: {formatCellAmount(amount)}
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

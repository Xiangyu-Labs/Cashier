/**
 * Large Day Cell (40px)
 */

"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getHeatmapColor, formatCellAmount } from "../../lib/heatmap-colors";
import type { HeatmapLevel } from "../../types";

interface DayCellLargeProps {
  date: string;
  dayNumber: number;
  amount: number;
  level: HeatmapLevel;
  onClick?: () => void;
  currency?: string;
  locale?: string;
}

export function DayCellLarge({
  date,
  dayNumber,
  amount,
  level,
  onClick,
  currency = "CNY",
  locale = "zh-CN",
}: DayCellLargeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const t = useTranslations("Calendar");

  return (
    <div className="relative min-w-0 overflow-visible">
      <button
        type="button"
        aria-label={`${date}, ${amount > 0 ? `${t("expense")}: ${formatCellAmount(amount, currency, locale)}` : t("noConsumption")}`}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "aspect-square w-full min-w-0 overflow-hidden rounded-lg transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]",
          "flex flex-col items-center justify-center gap-0.5",
          "hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
        style={{
          backgroundColor: getHeatmapColor(level),
          minHeight: "40px",
        }}
      >
        {/* Day number */}
        <span
          className={cn(
            "max-w-full truncate px-0.5 text-xs lg:text-sm font-normal",
            level >= 4 ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {dayNumber}
        </span>

        {/* Amount */}
        {amount > 0 && (
          <span
            className={cn(
              "max-w-full truncate px-0.5 text-xs font-semibold",
              level >= 4 ? "text-white" : "text-foreground"
            )}
          >
            {formatCellAmount(amount, currency, locale)}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <div>
              {t("expense")}: {formatCellAmount(amount, currency, locale)}
            </div>
          ) : (
            <div className="text-muted-foreground">{t("noConsumption")}</div>
          )}
        </div>
      )}
    </div>
  );
}

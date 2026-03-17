/**
 * Calendar Header Component
 *
 * View toggle, date navigation, and filter controls.
 */

"use client";

import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { CalendarViewType } from "../types";

interface CalendarHeaderProps {
  viewType: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
  anchorDate: string;
  onNavigate: (direction: "prev" | "next") => void;
  onToggleFilters: () => void;
  showFilters: boolean;
  className?: string;
}

export function CalendarHeader({
  viewType,
  onViewChange,
  anchorDate,
  onNavigate,
  onToggleFilters,
  showFilters,
  className,
}: CalendarHeaderProps) {
  const t = useTranslations("Calendar");

  // Format date display based on view type
  const dateDisplay = formatDateDisplay(anchorDate, viewType, t);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Top row: Navigation and View Toggle */}
      <div className="flex items-center justify-between">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onNavigate("prev")}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-[140px] text-center font-semibold text-lg">{dateDisplay}</div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => onNavigate("next")}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* View Toggle and Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-muted p-1">
            {(["month", "year"] as CalendarViewType[]).map((view) => (
              <button
                key={view}
                onClick={() => onViewChange(view)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                  viewType === view
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(viewLabels[view])}
              </button>
            ))}
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={onToggleFilters}
            className="h-9 w-9"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const viewLabels: Record<CalendarViewType, string> = {
  month: "month",
  year: "year",
};

function formatDateDisplay(
  dateStr: string,
  viewType: CalendarViewType,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const [year, month] = dateStr.split("-").map(Number);

  switch (viewType) {
    case "month":
      return t("dateFormat", { year, month });
    case "year":
      return `${year}${t("year")}`;
    default:
      return dateStr;
  }
}

"use client";
import * as React from "react";
import { Calendar as CalendarIcon, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { DateFilter } from "@/components/ui/date-filter";
import { type PeriodParams, type PeriodPreset } from "@/lib/period-utils";

export interface EntryFilters {
  startDate?: Date;
  endDate?: Date;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
}

interface EntryFilterPanelProps {
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams?: PeriodParams;
  onPeriodChange?: (params: PeriodParams) => void;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  showCategory?: boolean;
  showCurrency?: boolean;
  className?: string;
}

const VISIBLE_PRESETS: PeriodPreset[] = ["thisMonth", "week", "month", "custom"];

function normalizeAmountRange(filters: EntryFilters): EntryFilters {
  const { minAmount, maxAmount } = filters;

  if (minAmount == null || maxAmount == null || minAmount <= maxAmount) {
    return filters;
  }

  return {
    ...filters,
    minAmount: maxAmount,
    maxAmount: minAmount,
  };
}

export function EntryFilterPanel({
  filters,
  onFiltersChange,
  periodParams,
  onPeriodChange,
  categories = [],
  preferredCurrencies = [],
  showCategory = true,
  showCurrency = true,
  className,
}: EntryFilterPanelProps) {
  const t = useTranslations("EntryFilterPanel");
  const tDateRange = useTranslations("DateRangeFilter");
  const tSettings = useTranslations("Settings");
  const [open, setOpen] = React.useState(false);

  // Internal state for editing before applying - initialized from filters when popover opens
  const [tempFilters, setTempFilters] = React.useState<EntryFilters>(filters);
  const [tempPeriod, setTempPeriod] = React.useState<PeriodPreset | null>(null);

  // Reset temp filters when popover opens (not using useEffect to sync with external filters)
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Initialize draft state from current filters when opening
      setTempFilters(filters);
      setTempPeriod(null);
    }
  };

  // Count advanced filters (category, currency, amount)
  const advancedFilterCount = [
    showCategory && filters.categoryId != null && filters.categoryId !== "",
    showCurrency && filters.currency != null && filters.currency !== "",
    filters.minAmount !== undefined && filters.minAmount !== null,
    filters.maxAmount !== undefined && filters.maxAmount !== null,
    filters.search != null && filters.search !== "",
  ].filter((x): x is true => x === true).length;

  // Get active preset from periodParams if available, otherwise derive from filters
  const activePreset: PeriodPreset =
    (periodParams?.period != null && VISIBLE_PRESETS.includes(periodParams.period)
      ? periodParams.period
      : undefined) ??
    (() => {
      const now = new Date();
      const start = filters.startDate;
      const end = filters.endDate;

      if (start == null || end == null) return "thisMonth";

      // Check thisMonth
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      if (
        start.getTime() === monthStart.getTime() &&
        end.getDate() === monthEnd.getDate() &&
        end.getMonth() === monthEnd.getMonth()
      ) {
        return "thisMonth";
      }

      // Check past week (approximately)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      if (Math.abs(start.getTime() - weekAgo.getTime()) < 86400000) {
        return "week";
      }

      return "custom";
    })();

  const handleDatePreset = (preset: PeriodPreset) => {
    let newFilters = { ...tempFilters };

    if (preset !== "custom") {
      const end = new Date();
      const start = new Date();

      switch (preset) {
        case "thisMonth":
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          end.setMonth(end.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case "week":
          start.setDate(end.getDate() - 7);
          break;
        case "month":
          start.setMonth(end.getMonth() - 1);
          break;
      }

      newFilters = { ...newFilters, startDate: start, endDate: end };
    }

    setTempFilters(newFilters);
    setTempPeriod(preset);
  };

  const setTempFilterDate = (field: "startDate" | "endDate", date: Date | null) => {
    setTempFilters((prev) => {
      const next: EntryFilters = { ...prev };
      if (field === "startDate") {
        if (date == null) {
          delete next.startDate;
        } else {
          next.startDate = date;
        }
      } else if (date == null) {
        delete next.endDate;
      } else {
        next.endDate = date;
      }
      return next;
    });
    setTempPeriod("custom");
  };

  const handleApply = () => {
    const normalizedFilters = normalizeAmountRange(tempFilters);
    onFiltersChange(normalizedFilters);
    if (tempPeriod !== null && tempPeriod !== "custom" && onPeriodChange) {
      onPeriodChange({ period: tempPeriod });
    }
    setOpen(false);
  };

  const handleReset = () => {
    // Use thisMonth logic instead of billing period
    const now = new Date();
    const defaultFilters: EntryFilters = {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      categoryId: null,
      currency: null,
      minAmount: null,
      maxAmount: null,
      search: null,
    };
    setTempFilters(defaultFilters);
    setTempPeriod("thisMonth");
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Filters Button with Popover */}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-11 px-3 text-xs gap-1.5 sm:h-7 sm:px-2.5",
              advancedFilterCount > 0 && "border-primary/50 text-primary"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{t("moreFilters")}</span>
            {advancedFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                {advancedFilterCount}
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[380px] p-0" align="start">
          <div className="p-4 space-y-4">
            {/* Search Section */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t("search")}</div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={tempFilters.search ?? ""}
                  onChange={(e) =>
                    setTempFilters((prev) => ({
                      ...prev,
                      search: e.target.value !== "" ? e.target.value : null,
                    }))
                  }
                  className="h-11 pr-11 text-sm sm:h-8 sm:pr-8"
                />
                {tempFilters.search != null && tempFilters.search !== "" && (
                  <button
                    type="button"
                    aria-label={t("reset")}
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-text sm:right-1 sm:h-8 sm:w-8"
                    onClick={() => setTempFilters((prev) => ({ ...prev, search: null }))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Custom Date Range Section */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <CalendarIcon className="h-3 w-3" />
                {t("dateRange")}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { preset: "thisMonth", label: tDateRange("thisMonth") },
                    { preset: "week", label: tDateRange("pastWeek") },
                    { preset: "month", label: tDateRange("pastMonth") },
                    { preset: "custom", label: tDateRange("customRange") },
                  ] as const
                ).map(({ preset, label }) => {
                  const displayPreset = tempPeriod ?? activePreset;
                  const isActive = displayPreset === preset;
                  return (
                    <Button
                      key={preset}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "text-xs h-11 sm:h-7",
                        isActive && "bg-primary/10 text-primary font-medium"
                      )}
                      onClick={() => handleDatePreset(preset)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex gap-2 items-center">
                <DateFilter
                  {...(tempFilters.startDate != null ? { value: tempFilters.startDate } : {})}
                  onChange={(date) => setTempFilterDate("startDate", date)}
                  size="sm"
                  className="flex-1 h-11 sm:h-8"
                  showClear={false}
                />
                <span className="text-muted-foreground text-sm">-</span>
                <DateFilter
                  {...(tempFilters.endDate != null ? { value: tempFilters.endDate } : {})}
                  onChange={(date) => setTempFilterDate("endDate", date)}
                  size="sm"
                  className="flex-1 h-11 sm:h-8"
                  showClear={false}
                />
              </div>
            </div>

            {/* Category Select */}
            {showCategory && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t("category")}</div>
                <Select
                  value={tempFilters.categoryId ?? "__all__"}
                  onValueChange={(value) =>
                    setTempFilters((prev) => ({
                      ...prev,
                      categoryId: value === "__all__" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full h-11 text-sm sm:h-8">
                    <SelectValue placeholder={t("allCategories")} />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="__all__">{t("allCategories")}</SelectItem>
                    <SelectItem value="__uncategorized__">{tSettings("uncategorized")}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <CategoryIcon iconName={cat.icon} className="w-4 h-4 mr-2 inline-block" />
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Currency Select */}
            {showCurrency && preferredCurrencies.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t("currency")}</div>
                <Select
                  value={tempFilters.currency ?? "__all__"}
                  onValueChange={(value) =>
                    setTempFilters((prev) => ({
                      ...prev,
                      currency: value === "__all__" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full h-11 text-sm sm:h-8">
                    <SelectValue placeholder={t("allCurrencies")} />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="__all__">{t("allCurrencies")}</SelectItem>
                    {preferredCurrencies.map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Price Range */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t("priceRange")}</div>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  placeholder={t("minAmount")}
                  value={tempFilters.minAmount ?? ""}
                  onChange={(e) =>
                    setTempFilters((prev) => ({
                      ...prev,
                      minAmount: e.target.value !== "" ? Number(e.target.value) : null,
                    }))
                  }
                  className="flex-1 h-11 text-sm sm:h-8"
                  min={0}
                  inputMode="decimal"
                />
                <span className="text-muted-foreground text-sm">-</span>
                <Input
                  type="number"
                  placeholder={t("maxAmount")}
                  value={tempFilters.maxAmount ?? ""}
                  onChange={(e) =>
                    setTempFilters((prev) => ({
                      ...prev,
                      maxAmount: e.target.value !== "" ? Number(e.target.value) : null,
                    }))
                  }
                  className="flex-1 h-11 text-sm sm:h-8"
                  min={0}
                  inputMode="decimal"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="h-11 flex-1 sm:h-8"
                onClick={handleReset}
              >
                <X className="h-4 w-4 mr-1" />
                {t("reset")}
              </Button>
              <Button size="sm" className="h-11 flex-1 sm:h-8" onClick={handleApply}>
                {t("apply")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

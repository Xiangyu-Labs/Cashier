"use client";
import * as React from "react";
import { Calendar as CalendarIcon, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import {
  type EntryFilters,
  type StreamStatusPreset,
  STREAM_STATUS_PRESET_VALUES,
} from "@/modules/ledger/filters";

export type { EntryFilters } from "@/modules/ledger/filters";

interface EntryFilterPanelProps {
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams?: PeriodParams;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  showCategory?: boolean;
  showCurrency?: boolean;
  showStatus?: boolean;
  className?: string;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  onResetFilters?: () => void;
}

const VISIBLE_PRESETS: PeriodPreset[] = ["thisMonth", "all", "week", "month", "custom"];

const STATUS_OPTIONS: { status: SourceDocumentStatusType; labelKey: string }[] = [
  { status: "processing", labelKey: "statusProcessing" },
  { status: "completed", labelKey: "statusCompleted" },
  { status: "anomaly", labelKey: "statusAnomaly" },
  { status: "failed", labelKey: "statusFailed" },
  { status: "cancelled", labelKey: "statusCancelled" },
  { status: "candidate_pending", labelKey: "statusCandidatePending" },
];

const MOBILE_FILTER_QUERY = "(max-width: 639px)";

function subscribeToMobileFilter(callback: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_FILTER_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getMobileFilterSnapshot() {
  return window.matchMedia(MOBILE_FILTER_QUERY).matches;
}

function getServerMobileFilterSnapshot() {
  return false;
}

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
  categories = [],
  preferredCurrencies = [],
  showCategory = true,
  showCurrency = true,
  showStatus = true,
  className,
  onApplyPreset,
  onResetFilters,
}: EntryFilterPanelProps) {
  const t = useTranslations("EntryFilterPanel");
  const tDateRange = useTranslations("DateRangeFilter");
  const tSettings = useTranslations("Settings");
  const [open, setOpen] = React.useState(false);
  const isMobile = React.useSyncExternalStore(
    subscribeToMobileFilter,
    getMobileFilterSnapshot,
    getServerMobileFilterSnapshot
  );

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

  const activeFilterCount = [
    periodParams?.period != null && periodParams.period !== "thisMonth",
    filters.search != null && filters.search.trim() !== "",
    showStatus && (filters.statuses?.length ?? 0) > 0,
    showCategory && filters.categoryId != null && filters.categoryId !== "",
    showCurrency && filters.currency != null && filters.currency !== "",
    filters.minAmount !== undefined && filters.minAmount !== null,
    filters.maxAmount !== undefined && filters.maxAmount !== null,
  ].filter((x): x is true => x === true).length;

  // Get active preset from periodParams if available, otherwise derive from filters
  const activePreset: PeriodPreset =
    (periodParams?.period != null && VISIBLE_PRESETS.includes(periodParams.period)
      ? periodParams.period
      : undefined) ??
    (() => {
      const now = new Date();
      const start = filters.startDate != null ? parseDateString(filters.startDate) : undefined;
      const end = filters.endDate != null ? parseDateString(filters.endDate) : undefined;

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

    if (preset === "all") {
      delete newFilters.startDate;
      delete newFilters.endDate;
    } else if (preset !== "custom") {
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

      newFilters = {
        ...newFilters,
        startDate: formatDateTimeForApi(start),
        endDate: formatDateTimeForApi(end),
      };
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
          next.startDate = formatDateTimeForApi(date);
        }
      } else if (date == null) {
        delete next.endDate;
      } else {
        next.endDate = formatDateTimeForApi(date);
      }
      return next;
    });
    setTempPeriod("custom");
  };

  const handleApply = () => {
    const normalizedFilters = normalizeAmountRange(tempFilters);
    onFiltersChange(normalizedFilters);
    setOpen(false);
  };

  const handleReset = () => {
    if (onResetFilters != null) {
      onResetFilters();
      setOpen(false);
      return;
    }
    const now = new Date();
    const defaultFilters: EntryFilters = {
      startDate: formatDateTimeForApi(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: formatDateTimeForApi(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      categoryId: null,
      currency: null,
      minAmount: null,
      maxAmount: null,
      statuses: [],
      search: null,
    };
    setTempFilters(defaultFilters);
    setTempPeriod("thisMonth");
  };

  const toggleStatus = (status: SourceDocumentStatusType) => {
    setTempFilters((prev) => {
      const current = prev.statuses ?? [];
      const exists = current.includes(status);
      return {
        ...prev,
        statuses: exists ? current.filter((s) => s !== status) : [...current, status],
      };
    });
  };

  const resetStatuses = () => {
    setTempFilters((prev) => ({ ...prev, statuses: [] }));
  };

  const handlePreset = (preset: StreamStatusPreset) => {
    const presetStatuses = STREAM_STATUS_PRESET_VALUES[preset];
    if (onApplyPreset) {
      setTempFilters((prev) => ({ ...prev, statuses: presetStatuses }));
      setOpen(false);
      onApplyPreset(preset);
    } else {
      setTempFilters((prev) => ({ ...prev, statuses: presetStatuses }));
    }
  };

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-7 gap-1.5 px-2.5 text-xs",
        activeFilterCount > 0 && "border-primary/50 text-primary"
      )}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      aria-haspopup={isMobile ? "dialog" : undefined}
      aria-expanded={isMobile ? open : undefined}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span>{t("filter")}</span>
      {activeFilterCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
          {activeFilterCount}
        </span>
      )}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </Button>
  );

  const filterContent = (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{t("search")}</div>
        <Input
          type="search"
          value={tempFilters.search ?? ""}
          onChange={(event) =>
            setTempFilters((previous) => ({
              ...previous,
              search: event.target.value === "" ? null : event.target.value,
            }))
          }
          placeholder={t("searchPlaceholder")}
          className="h-9 text-base sm:text-sm"
        />
      </div>
      {/* Custom Date Range Section */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <CalendarIcon className="h-3 w-3" />
          {t("dateRange")}
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
          {(
            [
              { preset: "thisMonth", label: tDateRange("thisMonth") },
              { preset: "all", label: t("allTime") },
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
                className={cn("text-xs h-7", isActive && "bg-primary/10 text-primary font-medium")}
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
            className="flex-1 h-8"
            showClear={false}
          />
          <span className="text-muted-foreground text-sm">-</span>
          <DateFilter
            {...(tempFilters.endDate != null ? { value: tempFilters.endDate } : {})}
            onChange={(date) => setTempFilterDate("endDate", date)}
            size="sm"
            className="flex-1 h-8"
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
            <SelectTrigger className="w-full h-9 text-base sm:text-sm">
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
            <SelectTrigger className="w-full h-9 text-base sm:text-sm">
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
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
            min={0}
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
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
            min={0}
          />
        </div>
      </div>

      {/* Status */}
      {showStatus && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t("status")}</div>
          <div className="space-y-1">
            {STATUS_OPTIONS.map(({ status, labelKey }) => (
              <label key={status} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <Checkbox
                  checked={tempFilters.statuses?.includes(status) ?? false}
                  onCheckedChange={() => toggleStatus(status)}
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={resetStatuses}>
              {t("allStatuses")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => handlePreset("needs_attention")}
            >
              {t("needsAttention")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => handlePreset("in_progress")}
            >
              {t("inProgress")}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button variant="ghost" size="sm" className="flex-1 h-8" onClick={handleReset}>
          <X className="h-4 w-4 mr-1" />
          {t("reset")}
        </Button>
        <Button size="sm" className="flex-1 h-8" onClick={handleApply}>
          {t("apply")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {isMobile ? (
        <>
          {trigger}
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
              variant="sheet"
              className="max-h-[calc(100svh-1rem)] overflow-y-auto rounded-b-none rounded-t-lg p-0 pb-[env(safe-area-inset-bottom)]"
              aria-describedby={undefined}
            >
              <DialogTitle className="sr-only">{t("filter")}</DialogTitle>
              {filterContent}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="center"
            collisionPadding={16}
            sideOffset={10}
            className="max-h-[calc(100svh-8rem)] w-[min(420px,calc(100vw-2rem))] overflow-y-auto p-0 sm:w-[420px]"
          >
            {filterContent}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

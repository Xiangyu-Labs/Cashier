"use client";
import * as React from "react";
import { periodToDateRange, type PeriodParams, type PeriodPreset } from "@/lib/period-utils";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import {
  type EntryFilters,
  type StreamStatusPreset,
  STREAM_STATUS_PRESET_VALUES,
} from "@/modules/ledger/filters";
import { compare, DECIMAL_STRING_PATTERN } from "@/lib/money/decimal";

const VISIBLE_PRESETS: PeriodPreset[] = [
  "thisMonth",
  "all",
  "week",
  "lastMonth",
  "month",
  "custom",
];

function normalizeAmountRange(filters: EntryFilters): EntryFilters {
  const { minAmount, maxAmount } = filters;

  if (
    minAmount == null ||
    maxAmount == null ||
    !DECIMAL_STRING_PATTERN.test(minAmount) ||
    !DECIMAL_STRING_PATTERN.test(maxAmount) ||
    compare(minAmount, maxAmount) <= 0
  ) {
    return filters;
  }

  return {
    ...filters,
    minAmount: maxAmount,
    maxAmount: minAmount,
  };
}

interface UseEntryFilterDraftOptions {
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters, requestedPeriod?: PeriodPreset) => void;
  periodParams?: PeriodParams | undefined;
  showCategory: boolean;
  showCurrency: boolean;
  showStatus: boolean;
}

/** Owns the popover/sheet's draft filter state, independent from the applied `filters` prop. */
export function useEntryFilterDraft({
  filters,
  onFiltersChange,
  periodParams,
  showCategory,
  showCurrency,
  showStatus,
}: UseEntryFilterDraftOptions) {
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

      // Check past week — delegates to the same date-range math the server and
      // the URL layer use (period-utils.ts), instead of a second, drifting
      // day-diff heuristic.
      const weekRange = periodToDateRange({ period: "week" });
      if (filters.startDate === weekRange.startDate && filters.endDate === weekRange.endDate) {
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
      // Delegates to the same date-range math the server and the URL layer
      // use (period-utils.ts), instead of a second, drifting implementation.
      const range = periodToDateRange({ period: preset });
      newFilters = {
        ...newFilters,
        ...(range.startDate != null ? { startDate: range.startDate } : {}),
        ...(range.endDate != null ? { endDate: range.endDate } : {}),
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
    if (tempPeriod == null) onFiltersChange(normalizedFilters);
    else onFiltersChange(normalizedFilters, tempPeriod);
    setOpen(false);
  };

  const handleReset = () => {
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
    setTempFilters((prev) => ({ ...prev, statuses: presetStatuses }));
  };

  return {
    open,
    setOpen,
    handleOpenChange,
    tempFilters,
    setTempFilters,
    tempPeriod,
    activeFilterCount,
    activePreset,
    handleDatePreset,
    setTempFilterDate,
    handleApply,
    handleReset,
    toggleStatus,
    resetStatuses,
    handlePreset,
  };
}

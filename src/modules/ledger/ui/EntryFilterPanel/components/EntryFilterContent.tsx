"use client";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AmountInput } from "@/components/ui/amount-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { DateFilter } from "@/components/ui/date-filter";
import type { PeriodPreset } from "@/lib/period-utils";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import type { EntryFilters, StreamStatusPreset } from "@/modules/ledger/filters";

const STATUS_OPTIONS: SourceDocumentStatusType[] = [
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
  "candidate_pending",
  "duplicate_pending",
];

interface EntryFilterContentProps {
  tempFilters: EntryFilters;
  setTempFilters: (updater: (prev: EntryFilters) => EntryFilters) => void;
  tempPeriod: PeriodPreset | null;
  activePreset: PeriodPreset;
  handleDatePreset: (preset: PeriodPreset) => void;
  setTempFilterDate: (field: "startDate" | "endDate", date: Date | null) => void;
  handleApply: () => void;
  handleReset: () => void;
  toggleStatus: (status: SourceDocumentStatusType) => void;
  resetStatuses: () => void;
  handlePreset: (preset: StreamStatusPreset) => void;
  categories: EntryCategory[];
  preferredCurrencies: string[];
  showCategory: boolean;
  showCurrency: boolean;
  showStatus: boolean;
}

export function EntryFilterContent({
  tempFilters,
  setTempFilters,
  tempPeriod,
  activePreset,
  handleDatePreset,
  setTempFilterDate,
  handleApply,
  handleReset,
  toggleStatus,
  resetStatuses,
  handlePreset,
  categories,
  preferredCurrencies,
  showCategory,
  showCurrency,
  showStatus,
}: EntryFilterContentProps) {
  const t = useTranslations("EntryFilterPanel");
  const tDateRange = useTranslations("DateRangeFilter");
  const tSettings = useTranslations("Settings");

  const statusLabel = (status: SourceDocumentStatusType) => {
    switch (status) {
      case "processing":
        return t("statusProcessing");
      case "completed":
        return t("statusCompleted");
      case "anomaly":
        return t("statusAnomaly");
      case "failed":
        return t("statusFailed");
      case "cancelled":
        return t("statusCancelled");
      case "candidate_pending":
        return t("statusCandidatePending");
      case "duplicate_pending":
        return t("statusDuplicatePending");
    }
  };

  return (
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
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {(
            [
              { preset: "thisMonth", label: tDateRange("thisMonth") },
              { preset: "all", label: t("allTime") },
              { preset: "week", label: tDateRange("pastWeek") },
              { preset: "lastMonth", label: tDateRange("lastMonth") },
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
          <AmountInput
            placeholder={t("minAmount")}
            value={tempFilters.minAmount ?? ""}
            onChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                minAmount: value !== "" ? value : null,
              }))
            }
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
          />
          <span className="text-muted-foreground text-sm">-</span>
          <AmountInput
            placeholder={t("maxAmount")}
            value={tempFilters.maxAmount ?? ""}
            onChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                maxAmount: value !== "" ? value : null,
              }))
            }
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
          />
        </div>
      </div>

      {/* Status */}
      {showStatus && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t("status")}</div>
          <div className="space-y-1">
            {STATUS_OPTIONS.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <Checkbox
                  checked={tempFilters.statuses?.includes(status) ?? false}
                  onCheckedChange={() => toggleStatus(status)}
                />
                {statusLabel(status)}
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
              onClick={() => handlePreset("possible_duplicates")}
            >
              {t("possibleDuplicates")}
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
}

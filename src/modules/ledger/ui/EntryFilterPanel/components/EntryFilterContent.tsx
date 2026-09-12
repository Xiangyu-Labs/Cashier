"use client";
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
import {
  ENTRY_FILTER_PRESETS,
  type EntryFilterPreset,
} from "@/modules/ledger/entry-filter-presets";
import type { SourceDocumentProcessingStatus } from "@/modules/source-document/types";
import type { EntryFilters, StreamStatusPreset } from "@/modules/ledger/filters";

const STATUS_OPTIONS: SourceDocumentProcessingStatus[] = [
  "processing",
  "completed",
  "failed",
  "cancelled",
];

interface EntryFilterContentProps {
  tempFilters: EntryFilters;
  setTempFilters: (updater: (prev: EntryFilters) => EntryFilters) => void;
  displayPreset: EntryFilterPreset;
  handleDatePreset: (preset: EntryFilterPreset) => void;
  setTempFilterDate: (field: "startDate" | "endDate", date: Date | null) => void;
  handleApply: () => void;
  handleReset: () => void;
  toggleStatus: (status: SourceDocumentProcessingStatus) => void;
  handlePreset: (preset: StreamStatusPreset) => void;
  categories: EntryCategory[];
  preferredCurrencies: string[];
  timeZone?: string | undefined;
  showCategory: boolean;
  showCurrency: boolean;
  showStatus: boolean;
}

export function EntryFilterContent({
  tempFilters,
  setTempFilters,
  displayPreset,
  handleDatePreset,
  setTempFilterDate,
  handleApply,
  handleReset,
  toggleStatus,
  handlePreset,
  categories,
  preferredCurrencies,
  timeZone,
  showCategory,
  showCurrency,
  showStatus,
}: EntryFilterContentProps) {
  const t = useTranslations("EntryFilterPanel");
  const tDateRange = useTranslations("DateRangeFilter");
  const tSettings = useTranslations("Settings");

  const statusLabel = (status: SourceDocumentProcessingStatus) => {
    switch (status) {
      case "processing":
        return t("statusProcessing");
      case "completed":
        return t("statusCompleted");
      case "failed":
        return t("statusFailed");
      case "cancelled":
        return t("statusCancelled");
    }
  };
  const presetLabel = (preset: EntryFilterPreset) => {
    switch (preset) {
      case "thisMonth":
        return tDateRange("thisMonth");
      case "lastMonth":
        return tDateRange("lastMonth");
      case "all":
        return tDateRange("all");
      case "custom":
        return tDateRange("customRange");
    }
  };

  // The footer stays put while the sections scroll, so the primary action is
  // never something the user has to scroll to find.
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Input
          type="search"
          name="search"
          autoComplete="off"
          value={tempFilters.search ?? ""}
          onChange={(event) =>
            setTempFilters((previous) => ({
              ...previous,
              search: event.target.value === "" ? null : event.target.value,
            }))
          }
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-9 text-base sm:text-sm"
        />

        <div className="space-y-2">
          <div
            className="flex gap-1 rounded-lg bg-surface2 p-1"
            role="group"
            aria-label={t("dateRange")}
          >
            {ENTRY_FILTER_PRESETS.map((preset) => {
              const isActive = displayPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={isActive}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-[var(--motion-feedback)]",
                    isActive
                      ? "bg-surface text-primary shadow-sm"
                      : "text-muted-foreground hover:text-text"
                  )}
                  onClick={() => handleDatePreset(preset)}
                >
                  {presetLabel(preset)}
                </button>
              );
            })}
          </div>
          {/* The two fields only say something when the range is hand-picked;
              while a preset is active they would restate the preset. */}
          {displayPreset === "custom" ? (
            <div className="flex items-center gap-2">
              <DateFilter
                {...(tempFilters.startDate != null ? { value: tempFilters.startDate } : {})}
                onChange={(date) => setTempFilterDate("startDate", date)}
                size="sm"
                className="h-9 flex-1"
                showClear={false}
                ariaLabel={tDateRange("startDate")}
                {...(timeZone != null ? { timeZone } : {})}
              />
              <span className="text-sm text-muted-foreground">-</span>
              <DateFilter
                {...(tempFilters.endDate != null ? { value: tempFilters.endDate } : {})}
                onChange={(date) => setTempFilterDate("endDate", date)}
                size="sm"
                className="h-9 flex-1"
                showClear={false}
                ariaLabel={tDateRange("endDate")}
                {...(timeZone != null ? { timeZone } : {})}
              />
            </div>
          ) : null}
        </div>

        {showCategory && (
          <Select
            value={tempFilters.categoryId ?? "__all__"}
            onValueChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                categoryId: value === "__all__" ? null : value,
              }))
            }
          >
            <SelectTrigger aria-label={t("category")} className="w-full h-9 text-base sm:text-sm">
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
        )}

        {showCurrency && preferredCurrencies.length > 0 && (
          <Select
            value={tempFilters.currency ?? "__all__"}
            onValueChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                currency: value === "__all__" ? null : value,
              }))
            }
          >
            <SelectTrigger aria-label={t("currency")} className="w-full h-9 text-base sm:text-sm">
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
        )}

        <div className="flex items-center gap-2">
          <AmountInput
            placeholder={t("minAmount")}
            aria-label={t("minAmount")}
            name="minAmount"
            value={tempFilters.minAmount ?? ""}
            allowNegative
            onChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                minAmount: value !== "" ? value : null,
              }))
            }
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
          />
          <span className="text-sm text-muted-foreground">-</span>
          <AmountInput
            placeholder={t("maxAmount")}
            aria-label={t("maxAmount")}
            name="maxAmount"
            value={tempFilters.maxAmount ?? ""}
            allowNegative
            onChange={(value) =>
              setTempFilters((prev) => ({
                ...prev,
                maxAmount: value !== "" ? value : null,
              }))
            }
            className="min-w-0 flex-1 h-9 text-base sm:text-sm"
          />
        </div>

        {showStatus && (
          <fieldset className="space-y-1">
            <legend className="sr-only">{t("status")}</legend>
            {STATUS_OPTIONS.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <Checkbox
                  checked={tempFilters.statuses?.includes(status) ?? false}
                  onCheckedChange={() => toggleStatus(status)}
                />
                {statusLabel(status)}
              </label>
            ))}
            {/* Unchecking is how the status filter is cleared, so no 全部状态
                control restates the empty state. */}
            <div className="flex flex-wrap gap-1 pt-1">
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
          </fieldset>
        )}
      </div>

      <div className="flex gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="sm" className="flex-1" onClick={handleReset}>
          {t("reset")}
        </Button>
        <Button size="sm" className="flex-1" onClick={handleApply}>
          {t("apply")}
        </Button>
      </div>
    </div>
  );
}

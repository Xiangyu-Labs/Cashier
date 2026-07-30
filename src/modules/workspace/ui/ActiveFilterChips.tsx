"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui";
import { useTranslations } from "next-intl";

interface ActiveFilterChipsProps {
  filters: EntryFilters;
  categories?: EntryCategory[];
  onChange: (filters: EntryFilters) => void;
  onReset: () => void;
}

export function ActiveFilterChips({
  filters,
  categories = [],
  onChange,
  onReset,
}: ActiveFilterChipsProps) {
  const t = useTranslations("EntryFilterPanel");
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];

  if (filters.search != null && filters.search !== "") {
    chips.push({
      key: "search",
      label: t("searchChip", { value: filters.search }),
      clear: () => onChange({ ...filters, search: null }),
    });
  }
  if (filters.categoryId != null && filters.categoryId !== "") {
    const category = categories.find((item) => item.id === filters.categoryId);
    chips.push({
      key: "category",
      label: t("categoryChip", { value: category?.name ?? t("uncategorized") }),
      clear: () => onChange({ ...filters, categoryId: null }),
    });
  }
  if (filters.currency != null && filters.currency !== "") {
    chips.push({
      key: "currency",
      label: t("currencyChip", { value: filters.currency }),
      clear: () => onChange({ ...filters, currency: null }),
    });
  }
  if (filters.minAmount != null) {
    chips.push({
      key: "minAmount",
      label: t("minAmountChip", { value: filters.minAmount }),
      clear: () => onChange({ ...filters, minAmount: null }),
    });
  }
  if (filters.maxAmount != null) {
    chips.push({
      key: "maxAmount",
      label: t("maxAmountChip", { value: filters.maxAmount }),
      clear: () => onChange({ ...filters, maxAmount: null }),
    });
  }
  const startDate = filters.startDate;
  const endDate = filters.endDate;
  if (startDate != null || endDate != null) {
    chips.unshift({
      key: "date",
      label: t("dateChip", { start: startDate ?? "...", end: endDate ?? "..." }),
      clear: () => {
        const next = { ...filters };
        delete next.startDate;
        delete next.endDate;
        onChange(next);
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex basis-full flex-wrap items-center gap-1.5 border-t border-border pt-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex min-h-7 items-center gap-1 rounded-md bg-surface2 px-2 text-xs text-muted-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.clear}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-surface hover:text-text"
            aria-label={t("removeFilter", { filter: chip.label })}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onReset}
      >
        <RotateCcw className="mr-1 h-3 w-3" />
        {t("resetFilters")}
      </Button>
    </div>
  );
}

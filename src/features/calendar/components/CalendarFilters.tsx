/**
 * Calendar Filters Component
 *
 * Currency and category filters for calendar view.
 */

"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EntryCategory } from "@/types/api";
import type { CalendarFilters as CalendarFiltersType } from "../types";

interface CalendarFiltersProps {
  filters: CalendarFiltersType;
  onFiltersChange: (filters: CalendarFiltersType) => void;
  categories: EntryCategory[];
  preferredCurrencies: string[];
  className?: string;
}

export function CalendarFilters({
  filters,
  onFiltersChange,
  categories,
  preferredCurrencies,
  className,
}: CalendarFiltersProps) {
  const t = useTranslations("Calendar");
  const hasActiveFilters = filters.currency || filters.categoryId;

  const handleReset = () => {
    onFiltersChange({});
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-surface",
        className
      )}
    >
      {/* Currency Filter */}
      {preferredCurrencies.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("currency")}</span>
          <Select
            value={filters.currency || "__all__"}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                currency: value === "__all__" ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder={t("allCurrencies")} />
            </SelectTrigger>
            <SelectContent>
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

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("category")}</span>
        <Select
          value={filters.categoryId || "__all__"}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              categoryId: value === "__all__" ? undefined : value,
            })
          }
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder={t("allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allCategories")}</SelectItem>
            <SelectItem value="__uncategorized__">{t("uncategorized")}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset Button */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={handleReset}>
          <X className="h-3 w-3 mr-1" />
          {t("reset")}
        </Button>
      )}
    </div>
  );
}

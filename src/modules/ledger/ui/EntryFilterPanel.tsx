"use client";
import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { PeriodParams, PeriodPreset } from "@/lib/period-utils";
import { useEntryFilterDraft } from "./EntryFilterPanel/hooks/useEntryFilterDraft";
import { EntryFilterContent } from "./EntryFilterPanel/components/EntryFilterContent";
import { type EntryFilters } from "@/modules/ledger/filters";

export type { EntryFilters } from "@/modules/ledger/filters";

interface EntryFilterPanelProps {
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters, requestedPeriod?: PeriodPreset) => void;
  periodParams?: PeriodParams;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  showCategory?: boolean;
  showCurrency?: boolean;
  showStatus?: boolean;
  className?: string;
}

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
}: EntryFilterPanelProps) {
  const t = useTranslations("EntryFilterPanel");
  const isMobile = React.useSyncExternalStore(
    subscribeToMobileFilter,
    getMobileFilterSnapshot,
    getServerMobileFilterSnapshot
  );

  const draft = useEntryFilterDraft({
    filters,
    onFiltersChange,
    periodParams,
    showCategory,
    showCurrency,
    showStatus,
  });
  const { open, handleOpenChange, activeFilterCount } = draft;

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
    <EntryFilterContent
      {...draft}
      categories={categories}
      preferredCurrencies={preferredCurrencies}
      showCategory={showCategory}
      showCurrency={showCurrency}
      showStatus={showStatus}
    />
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

"use client";
import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TOOLBAR_CONTROL_CLASS } from "@/components/toolbar-control";
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
  periodParams: PeriodParams;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  /** Ledger timezone: the date fields' 今天/昨天 must name the ledger's day. */
  timeZone?: string;
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
  timeZone,
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
      className={cn(
        TOOLBAR_CONTROL_CLASS,
        activeFilterCount > 0 && "border-primary/50 text-primary"
      )}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      aria-label={
        activeFilterCount > 0 ? t("activeFilterCount", { count: activeFilterCount }) : t("filter")
      }
      aria-haspopup={isMobile ? "dialog" : undefined}
      aria-expanded={isMobile ? open : undefined}
    >
      <SlidersHorizontal aria-hidden="true" />
      <span>{t("filter")}</span>
      {activeFilterCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-micro font-medium text-primary">
          {activeFilterCount}
        </span>
      )}
      {/* A chevron promises a panel anchored to the trigger, which is what the
          desktop popover does; on mobile this opens a sheet from the bottom. */}
      {!isMobile && <ChevronDown aria-hidden="true" className="opacity-50" />}
    </Button>
  );

  const filterContent = (
    <EntryFilterContent
      {...draft}
      categories={categories}
      preferredCurrencies={preferredCurrencies}
      timeZone={timeZone}
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
              className="max-h-[calc(100svh-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-b-none rounded-t-lg p-0"
              aria-describedby={undefined}
            >
              {/* The sheet covers the trigger, so it has to say what it is. */}
              <DialogTitle className="border-b border-border px-4 py-3 pr-12 text-sm font-medium">
                {t("filter")}
              </DialogTitle>
              {filterContent}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            collisionPadding={16}
            sideOffset={10}
            className="max-h-[calc(100svh-8rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto p-0"
          >
            {filterContent}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { ArrowLeft, CheckSquare, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";
import type { PeriodParams } from "@/lib/period-utils";
import { SourceDocumentActions } from "@/modules/source-document/ui";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import {
  type StreamStatusPreset,
  STREAM_STATUS_PRESET_VALUES,
} from "@/modules/workspace/ledger-filter-state";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  isAllSelected: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string) => Promise<void> | void;
  isUpdatingDates?: boolean;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  filteredTotalLabel: string;
  mainCurrency: string;
  filteredTotal: number;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
}

function detectActivePreset(statuses: SourceDocumentStatusType[] | undefined): StreamStatusPreset | null {
  if (statuses == null || statuses.length === 0) return null;
  for (const [preset, values] of Object.entries(STREAM_STATUS_PRESET_VALUES) as [StreamStatusPreset, SourceDocumentStatusType[]][]) {
    if (values.length === statuses.length && values.every((v) => statuses.includes(v))) {
      return preset;
    }
  }
  return null;
}

export function LedgerEntriesToolbar({
  isSelectionMode,
  isAllSelected,
  selectedCount,
  onToggleSelectionMode,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  isUpdatingDates = false,
  filters,
  onFiltersChange,
  periodParams,
  onPeriodChange,
  filteredTotalLabel,
  mainCurrency,
  filteredTotal,
  onApplyPreset,
}: LedgerEntriesToolbarProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tBatch = useTranslations("BatchActions");
  const tFilter = useTranslations("EntryFilterPanel");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const showBatchActions = isSelectionMode && selectedCount > 0;
  const masterChecked: boolean | "indeterminate" =
    isAllSelected ? true : selectedCount > 0 ? "indeterminate" : false;
  const handleUpdateDates = () => {
    if (!onUpdateDates) return;
    return onUpdateDates(formatDateTimeForApi(selectedDate));
  };

  const activeStatusPreset = useMemo(
    () => detectActivePreset(filters.statuses),
    [filters.statuses]
  );

  const handleClearStatuses = () => {
    onFiltersChange({ ...filters, statuses: [] });
  };

  return (
    <div className="px-2 mb-2 sm:mb-4 flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSelectionMode}
        className="shrink-0 h-8 w-8"
        title={isSelectionMode ? t("cancelSelect") : t("select")}
      >
        {isSelectionMode ? (
          <ArrowLeft className="h-4 w-4" />
        ) : (
          <CheckSquare className="h-4 w-4" />
        )}
      </Button>

      {isSelectionMode && (
        <>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
            <Checkbox
              checked={masterChecked}
              onCheckedChange={(checked) => {
                if (checked === true) onSelectAll();
                else onClearSelection();
              }}
              aria-label={isAllSelected ? t("deselectAll") : t("selectAll")}
              className="h-4 w-4"
            />
            <span className="text-xs font-medium text-text">{tBatch("selected", { count: selectedCount })}</span>
          </div>
        </>
      )}

      {showBatchActions && (
        <>
          <div className="min-w-0 shrink-0 basis-full sm:basis-auto">
            <SourceDocumentActions
              isProcessing={isUpdatingDates}
              isUpdatingDates={isUpdatingDates}
              onUpdateDates={handleUpdateDates}
              onCancel={() => setDatePickerOpen(false)}
              datePickerOpen={datePickerOpen}
              setDatePickerOpen={setDatePickerOpen}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              showUpdateDates={onUpdateDates !== undefined}
            />
          </div>
        </>
      )}

      {!isSelectionMode && (
        <EntryFilterPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          periodParams={periodParams}
          onPeriodChange={onPeriodChange}
          showCategory={false}
          showCurrency={false}
          className={cn("w-auto", showBatchActions && "sm:ml-auto")}
          {...(onApplyPreset != null ? { onApplyPreset } : {})}
        />
      )}

      {!isSelectionMode && filters.statuses != null && filters.statuses.length > 0 && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {activeStatusPreset != null
            ? tFilter("statusSummary", { label: tFilter(activeStatusPreset === "needs_attention" ? "needsAttention" : "inProgress") })
            : tFilter("statusSummary", { label: `${filters.statuses.length}` })}
          <button
            type="button"
            onClick={handleClearStatuses}
            className="inline-flex items-center hover:text-text"
            aria-label={tFilter("allStatuses")}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      <span className={cn("text-xs text-muted-foreground font-mono ml-auto", showBatchActions && "sm:ml-0")}>
        {filteredTotalLabel} {mainCurrency} {filteredTotal.toFixed(2)}
      </span>
    </div>
  );
}

import { useState, useMemo } from "react";
import { ArrowLeft, CheckSquare, RefreshCw, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  isAllSelected: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string) => Promise<void> | void;
  isUpdatingDates?: boolean;
  onRetry?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isRetrying?: boolean;
  isDeleting?: boolean;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams: PeriodParams;
  filteredTotalLabel: string;
  mainCurrency: string;
  filteredTotal: number;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  statusSummaryRef?: React.RefObject<HTMLSpanElement | null> | undefined;
}

function detectActivePreset(
  statuses: SourceDocumentStatusType[] | undefined
): StreamStatusPreset | null {
  if (statuses == null || statuses.length === 0) return null;
  for (const [preset, values] of Object.entries(STREAM_STATUS_PRESET_VALUES) as [
    StreamStatusPreset,
    SourceDocumentStatusType[],
  ][]) {
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
  onRetry,
  onDelete,
  isRetrying = false,
  isDeleting = false,
  filters,
  onFiltersChange,
  periodParams,
  filteredTotalLabel,
  mainCurrency,
  filteredTotal,
  onApplyPreset,
  statusSummaryRef,
}: LedgerEntriesToolbarProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const showBatchActions = isSelectionMode && selectedCount > 0;
  const isProcessing = isUpdatingDates || isRetrying || isDeleting;
  const masterChecked: boolean | "indeterminate" = isAllSelected
    ? true
    : selectedCount > 0
      ? "indeterminate"
      : false;
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
    <div className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 sm:mb-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSelectionMode}
        className="shrink-0 h-8 w-8"
        title={isSelectionMode ? t("cancelSelect") : t("select")}
      >
        {isSelectionMode ? <ArrowLeft className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
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
            <span className="text-xs font-medium text-text">
              {tBatch("selected", { count: selectedCount })}
            </span>
          </div>
        </>
      )}

      {showBatchActions && (
        <>
          <div className="min-w-0 shrink-0 basis-full sm:basis-auto">
            <SourceDocumentActions
              isProcessing={isProcessing}
              isUpdatingDates={isUpdatingDates}
              onUpdateDates={handleUpdateDates}
              onCancel={() => setDatePickerOpen(false)}
              datePickerOpen={datePickerOpen}
              setDatePickerOpen={setDatePickerOpen}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              showUpdateDates={onUpdateDates !== undefined}
            />
            {onRetry != null && (
              <Button variant="outline" size="sm" disabled={isProcessing} onClick={onRetry} className="ml-1 h-8 text-xs sm:h-9">
                <RefreshCw className={cn("mr-1 h-3.5 w-3.5", isRetrying && "animate-spin")} />
                {tBatch("retry")}
              </Button>
            )}
            {onDelete != null && (
              <ConfirmDialog
                title={tBatch("deleteTitle")}
                description={tBatch("deleteDescription", { count: selectedCount })}
                variant="destructive"
                confirmLabel={tCommon("delete")}
                onConfirm={onDelete}
                trigger={
                  <Button variant="destructive" size="sm" disabled={isProcessing} className="ml-1 h-8 text-xs sm:h-9">
                    <Trash2 className="mr-1 h-3.5 w-3.5" />{tCommon("delete")}
                  </Button>
                }
              />
            )}
          </div>
        </>
      )}

      {!isSelectionMode && (
        <EntryFilterPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          periodParams={periodParams}
          showCategory={false}
          showCurrency={false}
          className={cn("w-auto", showBatchActions && "sm:ml-auto")}
          {...(onApplyPreset != null ? { onApplyPreset } : {})}
        />
      )}

      {!isSelectionMode && filters.statuses != null && filters.statuses.length > 0 && (
        <span
          ref={statusSummaryRef}
          tabIndex={-1}
          className="text-xs text-muted-foreground flex items-center gap-1 outline-none"
        >
          {activeStatusPreset != null
            ? tFilter("statusSummary", {
                label: tFilter(
                  activeStatusPreset === "needs_attention" ? "needsAttention" : "inProgress"
                ),
              })
            : tFilter("statusSummary", { label: `${filters.statuses.length}` })}
          <button
            type="button"
            onClick={handleClearStatuses}
            className="inline-flex items-center hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label={tFilter("allStatuses")}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {!isSelectionMode && (
        <AmountText variant="summary" className="ml-auto">
          {filteredTotalLabel} {formatCurrencyAmount(filteredTotal, mainCurrency, locale)}
        </AmountText>
      )}
    </div>
  );
}

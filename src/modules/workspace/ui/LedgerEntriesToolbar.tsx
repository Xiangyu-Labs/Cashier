import { useState } from "react";
import { ArrowLeft, CheckSquare, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";
import type { PeriodParams } from "@/lib/period-utils";
import { SourceDocumentActions } from "@/modules/source-document/ui/batch-action-toolbar/SourceDocumentActions";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi } from "@/lib/date-utils";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  isAllSelected: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string) => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isUpdatingDates?: boolean;
  isRetrying?: boolean;
  isDeleting?: boolean;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  filteredTotalLabel: string;
  mainCurrency: string;
  filteredTotal: number;
}

export function LedgerEntriesToolbar({
  isSelectionMode,
  isAllSelected,
  selectedCount,
  onToggleSelectionMode,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  onRetry,
  onDelete,
  isUpdatingDates = false,
  isRetrying = false,
  isDeleting = false,
  filters,
  onFiltersChange,
  periodParams,
  onPeriodChange,
  filteredTotalLabel,
  mainCurrency,
  filteredTotal,
}: LedgerEntriesToolbarProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tBatch = useTranslations("BatchActions");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const isProcessing = isUpdatingDates || isRetrying || isDeleting;
  const showBatchActions = isSelectionMode && selectedCount > 0;
  const masterChecked: boolean | "indeterminate" =
    isAllSelected ? true : selectedCount > 0 ? "indeterminate" : false;
  const handleUpdateDates = () => {
    if (!onUpdateDates) return;
    return onUpdateDates(formatDateTimeForApi(selectedDate));
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
                if (checked) onSelectAll();
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
              isProcessing={isProcessing}
              isUpdatingDates={isUpdatingDates}
              isRetrying={isRetrying}
              onUpdateDates={handleUpdateDates}
              onRetry={onRetry ?? (() => {})}
              onCancel={() => setDatePickerOpen(false)}
              datePickerOpen={datePickerOpen}
              setDatePickerOpen={setDatePickerOpen}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              showUpdateDates={onUpdateDates !== undefined}
              showRetry={onRetry !== undefined}
            />
          </div>

          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onDelete()}
              disabled={isProcessing}
              className={cn(
                "h-8 sm:h-9 px-2 sm:px-3",
                "text-destructive hover:text-destructive hover:bg-destructive/10",
                "border-destructive/30"
              )}
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </Button>
          )}
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
        />
      )}

      <span className={cn("text-xs text-muted-foreground font-mono ml-auto", showBatchActions && "sm:ml-0")}>
        {filteredTotalLabel} {mainCurrency} {filteredTotal.toFixed(2)}
      </span>
    </div>
  );
}

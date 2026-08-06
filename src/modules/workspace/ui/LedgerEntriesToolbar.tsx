import { useState } from "react";
import { ArrowLeft, CheckSquare, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { PeriodParams } from "@/lib/period-utils";
import { SourceDocumentActions } from "@/modules/source-document/ui";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { type StreamStatusPreset } from "@/modules/workspace/ledger-filter-state";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntriesToolbarShell } from "./EntriesToolbarShell";
import type { ReactNode } from "react";
import { BatchActionButton } from "@/components/batch-action-button";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  isAllSelected: boolean;
  selectedCount: number;
  selectedDuplicateCount?: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string) => Promise<void> | void;
  isUpdatingDates?: boolean;
  onRetry?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isRetrying?: boolean;
  isDeleting?: boolean;
  onKeepDuplicates?: () => Promise<void> | void;
  onDiscardDuplicates?: () => Promise<void> | void;
  isKeepingDuplicates?: boolean;
  isDiscardingDuplicates?: boolean;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams: PeriodParams;
  totalPrefix?: string;
  mainCurrency: string;
  filteredTotal: number;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  onResetFilters?: () => void;
  readOnly?: boolean;
  syncStatus?: ReactNode;
}

export function LedgerEntriesToolbar({
  isSelectionMode,
  isAllSelected,
  selectedCount,
  selectedDuplicateCount = 0,
  onToggleSelectionMode,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  isUpdatingDates = false,
  onRetry,
  onDelete,
  isRetrying = false,
  isDeleting = false,
  onKeepDuplicates,
  onDiscardDuplicates,
  isKeepingDuplicates = false,
  isDiscardingDuplicates = false,
  filters,
  onFiltersChange,
  periodParams,
  totalPrefix,
  mainCurrency,
  filteredTotal,
  onApplyPreset,
  onResetFilters,
  readOnly = false,
  syncStatus,
}: LedgerEntriesToolbarProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const locale = useLocale();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const showBatchActions = isSelectionMode && selectedCount > 0;
  const isProcessing =
    isUpdatingDates || isRetrying || isDeleting || isKeepingDuplicates || isDiscardingDuplicates;
  const masterChecked: boolean | "indeterminate" = isAllSelected
    ? true
    : selectedCount > 0
      ? "indeterminate"
      : false;
  const handleUpdateDates = () => {
    if (!onUpdateDates) return;
    return onUpdateDates(formatDateTimeForApi(selectedDate));
  };

  return (
    <EntriesToolbarShell
      syncStatus={syncStatus}
      totalLabel={
        !isSelectionMode
          ? [totalPrefix, formatCurrencyAmount(filteredTotal, mainCurrency, locale)]
              .filter(Boolean)
              .join(" ")
          : undefined
      }
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSelectionMode}
        disabled={readOnly}
        className="shrink-0 h-8 w-8"
        title={
          readOnly ? tCommon("readOnlyPreview") : isSelectionMode ? t("cancelSelect") : t("select")
        }
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
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 basis-full sm:basis-auto">
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
              duplicateCount={selectedDuplicateCount}
              {...(onKeepDuplicates != null ? { onKeepDuplicates } : {})}
              {...(onDiscardDuplicates != null ? { onDiscardDuplicates } : {})}
              isKeepingDuplicates={isKeepingDuplicates}
              isDiscardingDuplicates={isDiscardingDuplicates}
            />
            {onRetry != null && (
              <BatchActionButton
                variant="outline"
                icon={RefreshCw}
                loading={isRetrying}
                disabled={isProcessing}
                onClick={onRetry}
              >
                {tBatch("retry")}
              </BatchActionButton>
            )}
            {onDelete != null && (
              <ConfirmDialog
                title={tBatch("deleteTitle")}
                description={tBatch("deleteDescription", { count: selectedCount })}
                variant="destructive"
                confirmLabel={tCommon("delete")}
                onConfirm={onDelete}
                trigger={
                  <BatchActionButton
                    variant="destructive"
                    icon={Trash2}
                    loading={isDeleting}
                    disabled={isProcessing}
                  >
                    {tCommon("delete")}
                  </BatchActionButton>
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
          {...(onResetFilters != null ? { onResetFilters } : {})}
        />
      )}
    </EntriesToolbarShell>
  );
}

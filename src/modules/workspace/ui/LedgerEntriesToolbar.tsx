import { useState } from "react";
import { ArrowLeft, CheckSquare, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { PeriodParams, PeriodPreset } from "@/lib/period-utils";
import { SourceDocumentActions } from "@/modules/source-document/ui";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi, getDateInTimezone, parseDateString } from "@/lib/date-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntriesToolbarShell } from "./EntriesToolbarShell";
import type { ReactNode } from "react";
import { BatchActionButton } from "@/components/batch-action-button";
import type { BatchEntryDateImpact } from "@/modules/ledger/application/ports";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  isAllSelected: boolean;
  hasMoreData?: boolean;
  selectedCount: number;
  selectedSourceDocumentIds?: string[];
  selectedEntryIds?: string[];
  selectedDuplicateCount?: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string, sourceDocumentIds: string[]) => Promise<void> | void;
  onPreviewDateImpact?: (
    sourceDocumentIds: string[],
    entryIds: string[]
  ) => Promise<BatchEntryDateImpact>;
  isUpdatingDates?: boolean;
  onRetry?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isRetrying?: boolean;
  isDeleting?: boolean;
  onKeepDuplicates?: () => Promise<void> | void;
  onDiscardDuplicates?: () => Promise<void> | void;
  isKeepingDuplicates?: boolean;
  isDiscardingDuplicates?: boolean;
  isProcessing?: boolean;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters, requestedPeriod?: PeriodPreset) => void;
  periodParams: PeriodParams;
  totalPrefix?: string;
  mainCurrency: string;
  filteredTotal?: string;
  timeZone?: string;
  readOnly?: boolean;
  syncStatus?: ReactNode;
}

export function LedgerEntriesToolbar({
  isSelectionMode,
  isAllSelected,
  hasMoreData = false,
  selectedCount,
  selectedSourceDocumentIds = [],
  selectedEntryIds = [],
  selectedDuplicateCount = 0,
  onToggleSelectionMode,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  onPreviewDateImpact,
  isUpdatingDates = false,
  onRetry,
  onDelete,
  isRetrying = false,
  isDeleting = false,
  onKeepDuplicates,
  onDiscardDuplicates,
  isKeepingDuplicates = false,
  isDiscardingDuplicates = false,
  isProcessing: externallyProcessing = false,
  filters,
  onFiltersChange,
  periodParams,
  totalPrefix,
  mainCurrency,
  filteredTotal,
  timeZone,
  readOnly = false,
  syncStatus,
}: LedgerEntriesToolbarProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const locale = useLocale();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const date = getDateInTimezone(timeZone);
    return date == null ? new Date() : parseDateString(date);
  });
  const [dateImpact, setDateImpact] = useState<BatchEntryDateImpact | null>(null);
  const [dateImpactError, setDateImpactError] = useState(false);
  const [isPreviewingDateImpact, setIsPreviewingDateImpact] = useState(false);
  const [dateConfirmOpen, setDateConfirmOpen] = useState(false);
  const [dateSelectionSnapshot, setDateSelectionSnapshot] = useState<{
    sourceDocumentIds: string[];
    entryIds: string[];
  } | null>(null);
  const showBatchActions = isSelectionMode && selectedCount > 0;
  const isProcessing =
    externallyProcessing ||
    isUpdatingDates ||
    isRetrying ||
    isDeleting ||
    isKeepingDuplicates ||
    isDiscardingDuplicates;
  const masterChecked: boolean | "indeterminate" = isAllSelected
    ? true
    : selectedCount > 0
      ? "indeterminate"
      : false;
  const handlePreviewDateImpact = async () => {
    if (!onUpdateDates) return;
    const snapshot = {
      sourceDocumentIds: [...selectedSourceDocumentIds],
      entryIds: [...selectedEntryIds],
    };
    if (onPreviewDateImpact == null) {
      return onUpdateDates(formatDateTimeForApi(selectedDate), snapshot.sourceDocumentIds);
    }
    setIsPreviewingDateImpact(true);
    setDateImpactError(false);
    try {
      setDateImpact(await onPreviewDateImpact(snapshot.sourceDocumentIds, snapshot.entryIds));
      setDateSelectionSnapshot(snapshot);
      setDatePickerOpen(false);
      setDateConfirmOpen(true);
    } catch {
      setDateImpactError(true);
    } finally {
      setIsPreviewingDateImpact(false);
    }
  };

  return (
    <EntriesToolbarShell
      syncStatus={syncStatus}
      totalLabel={
        !isSelectionMode && filteredTotal !== undefined
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
        disabled={readOnly || isProcessing}
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
              disabled={isProcessing}
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
            {isAllSelected && hasMoreData ? (
              <span className="text-xs text-muted-foreground">
                {tBatch("loadedOnly", { count: selectedCount })}
              </span>
            ) : null}
          </div>
        </>
      )}

      {showBatchActions && (
        <>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 basis-full sm:basis-auto">
            <SourceDocumentActions
              isProcessing={isProcessing}
              isUpdatingDates={isUpdatingDates}
              onUpdateDates={() => void handlePreviewDateImpact()}
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
              dateImpactError={dateImpactError}
              isPreviewingDateImpact={isPreviewingDateImpact}
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
                description={tBatch("deleteDescription", {
                  count: selectedCount,
                  scope: isAllSelected && hasMoreData ? tBatch("loadedScope") : "",
                })}
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
        />
      )}
      <ConfirmDialog
        open={dateConfirmOpen}
        onOpenChange={setDateConfirmOpen}
        title={tBatch("dateImpactTitle")}
        description={tBatch("dateImpactDescription", {
          documents: dateImpact?.sourceDocumentCount ?? 0,
          entries: dateImpact?.affectedEntryCount ?? 0,
          scope: isAllSelected && hasMoreData ? tBatch("loadedScope") : "",
        })}
        confirmLabel={tBatch("confirm")}
        onConfirm={async () => {
          if (dateImpact == null || onUpdateDates == null) return false;
          if (dateSelectionSnapshot == null) return false;
          await onUpdateDates(
            formatDateTimeForApi(selectedDate),
            dateSelectionSnapshot.sourceDocumentIds
          );
          setDateImpact(null);
          setDateSelectionSnapshot(null);
          return true;
        }}
      />
    </EntriesToolbarShell>
  );
}

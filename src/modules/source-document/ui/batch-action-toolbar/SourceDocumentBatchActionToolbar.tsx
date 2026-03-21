"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { SourceDocumentActions } from "./SourceDocumentActions";

export interface SourceDocumentBatchActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  hasMoreData?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates?: (date: string) => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isUpdatingDates?: boolean;
  isRetrying?: boolean;
  isDeleting?: boolean;
  variant?: "fixed" | "inline";
}

export function SourceDocumentBatchActionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  hasMoreData = false,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  onRetry,
  onDelete,
  isUpdatingDates: isUpdatingDatesProp,
  isRetrying: isRetryingProp,
  isDeleting: isDeletingProp,
  variant = "fixed",
}: SourceDocumentBatchActionToolbarProps) {
  const t = useTranslations("BatchActions");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [internalUpdatingDates, setInternalUpdatingDates] = useState(false);
  const [internalRetrying, setInternalRetrying] = useState(false);
  const [internalDeleting, setInternalDeleting] = useState(false);

  const isUpdatingDates = isUpdatingDatesProp ?? internalUpdatingDates;
  const isRetrying = isRetryingProp ?? internalRetrying;
  const isDeleting = isDeletingProp ?? internalDeleting;
  const isProcessing = isUpdatingDates || isRetrying || isDeleting;

  const handleUpdateDates = useCallback(async () => {
    if (!onUpdateDates) return;
    const date = formatDateTimeForApi(selectedDate);

    if (isUpdatingDatesProp === undefined) {
      setInternalUpdatingDates(true);
      try {
        await onUpdateDates(date);
      } finally {
        setInternalUpdatingDates(false);
        setDatePickerOpen(false);
      }
      return;
    }

    await onUpdateDates(date);
    setDatePickerOpen(false);
  }, [isUpdatingDatesProp, onUpdateDates, selectedDate]);

  const handleRetry = useCallback(async () => {
    if (!onRetry) return;

    if (isRetryingProp === undefined) {
      setInternalRetrying(true);
      try {
        await onRetry();
      } finally {
        setInternalRetrying(false);
      }
      return;
    }

    await onRetry();
  }, [isRetryingProp, onRetry]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    if (isDeletingProp === undefined) {
      setInternalDeleting(true);
      try {
        await onDelete();
      } finally {
        setInternalDeleting(false);
        setDeleteConfirmOpen(false);
      }
      return;
    }

    await onDelete();
    setDeleteConfirmOpen(false);
  }, [isDeletingProp, onDelete]);

  const containerClasses =
    variant === "fixed"
      ? "fixed bottom-0 left-0 right-0 z-action-bar px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
      : "shrink-0 pointer-events-auto";
  const innerWrapperClasses = variant === "fixed" ? "max-w-lg mx-auto pointer-events-auto" : "";
  const showDelete = onDelete !== undefined;

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={variant === "fixed" ? { y: 100, opacity: 0 } : { height: 0, opacity: 0 }}
            animate={variant === "fixed" ? { y: 0, opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={variant === "fixed" ? { y: 100, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={containerClasses}
          >
            <div className={cn(innerWrapperClasses, variant === "inline" && "border-t bg-surface/95")}>
              <div
                className={cn(
                  "border border-border shadow-lg p-2 sm:p-3 bg-surface2",
                  variant === "fixed" && "rounded-xl",
                  variant === "inline" && "border-x-0 border-b-0"
                )}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-sm font-medium">
                      {t("selected", { count: selectedCount })}
                    </span>
                    {isAllSelected && hasMoreData && (
                      <span className="text-[10px] text-muted-foreground">{t("loadedOnly")}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={isAllSelected ? onClearSelection : onSelectAll}
                    className="text-xs h-7 px-2"
                  >
                    {isAllSelected ? t("deselectAll") : t("selectAll")}
                    {!isAllSelected && (
                      <span className="ml-1 text-muted-foreground">({totalCount})</span>
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  <SourceDocumentActions
                    isProcessing={isProcessing}
                    isUpdatingDates={isUpdatingDates}
                    isRetrying={isRetrying}
                    onUpdateDates={handleUpdateDates}
                    onRetry={handleRetry}
                    onCancel={() => setDatePickerOpen(false)}
                    datePickerOpen={datePickerOpen}
                    setDatePickerOpen={setDatePickerOpen}
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    showUpdateDates={onUpdateDates !== undefined}
                    showRetry={onRetry !== undefined}
                  />

                  {showDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteConfirmOpen(true)}
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
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showDelete && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={t("deleteConfirmTitle", { count: selectedCount })}
          description={t("deleteConfirmDesc")}
          onConfirm={handleDelete}
          variant="destructive"
          confirmLabel={t("delete")}
        />
      )}
    </>
  );
}

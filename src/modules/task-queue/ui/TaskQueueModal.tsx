"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { TaskQueueDialogs } from "./TaskQueueDialogs";
import { TaskQueueContent } from "./TaskQueueContent";
import { useTaskQueueModal } from "./useTaskQueueModal";

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    const value = num / 1_000_000_000;
    return value % 1 === 0 ? `${value.toFixed(0)}b` : `${value.toFixed(1)}b`;
  }

  if (num >= 1_000_000) {
    const value = num / 1_000_000;
    return value % 1 === 0 ? `${value.toFixed(0)}m` : `${value.toFixed(1)}m`;
  }

  if (num >= 1_000) {
    const value = num / 1_000;
    return value % 1 === 0 ? `${value.toFixed(0)}k` : `${value.toFixed(1)}k`;
  }

  return num.toString();
}

interface TaskQueueModalProps {
  ledgerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskQueueModal({ ledgerId, open, onOpenChange }: TaskQueueModalProps) {
  const t = useTranslations("TaskQueue");
  const {
    isPendingCollapsed,
    isRunningCollapsed,
    isFailedCollapsed,
    isAnomalyCollapsed,
    isCompletedCollapsed,
    retrySourceDocId,
    deleteConfirm,
    stats,
    isLoading,
    groupedItems,
    isEmpty,
    failedWithSourceDoc,
    failedWithoutSourceDoc,
    batchDelete,
    setIsPendingCollapsed,
    setIsRunningCollapsed,
    setIsFailedCollapsed,
    setIsAnomalyCollapsed,
    setIsCompletedCollapsed,
    setRetrySourceDocId,
    setDeleteConfirm,
    handleDeleteConfirmAction,
    handleRetry,
    handleDeleteSingle,
    handleDeleteAll,
    handleRetryAll,
    handleCancel,
    handleDismiss,
    handleDismissAll,
    handleViewDetails,
    handleRetrySuccess,
  } = useTaskQueueModal(ledgerId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="mx-auto flex max-h-[75vh] w-[calc(100%-1rem)] translate-y-0 flex-col rounded-xl top-[10%] sm:top-[15%] sm:w-full sm:max-w-md"
          aria-describedby={undefined}
        >
          <DialogHeader className="shrink-0 border-b border-border pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              {t("title")}
              {stats.total > 0 && (
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {stats.total}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <TaskQueueContent
              ledgerId={ledgerId}
              isLoading={isLoading}
              isEmpty={isEmpty}
              groupedItems={groupedItems}
              collapsedState={{
                isPendingCollapsed,
                isRunningCollapsed,
                isFailedCollapsed,
                isAnomalyCollapsed,
                isCompletedCollapsed,
              }}
              failedStats={{
                withSourceDoc: failedWithSourceDoc,
                withoutSourceDoc: failedWithoutSourceDoc,
              }}
              onTogglePending={() => setIsPendingCollapsed(!isPendingCollapsed)}
              onToggleRunning={() => setIsRunningCollapsed(!isRunningCollapsed)}
              onToggleFailed={() => setIsFailedCollapsed(!isFailedCollapsed)}
              onToggleAnomaly={() => setIsAnomalyCollapsed(!isAnomalyCollapsed)}
              onToggleCompleted={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
              onRetry={handleRetry}
              onDeleteSingle={handleDeleteSingle}
              onDeleteAll={handleDeleteAll}
              onRetryAll={handleRetryAll}
              onCancel={handleCancel}
              onDismiss={handleDismiss}
              onDismissAll={handleDismissAll}
              onViewDetails={handleViewDetails}
              onDeleteAllAnomaly={(ids) => batchDelete.mutate(ids)}
            />
          </div>

          {stats.completedCount > 0 && (
            <div className="shrink-0 border-t border-border pt-2">
              <p className="text-center text-[10px] text-muted-foreground">
                {t("tokenStats", {
                  input: formatCompactNumber(stats.totalInputTokens),
                  output: formatCompactNumber(stats.totalOutputTokens),
                  avg: formatCompactNumber(stats.avgTokensPerTask),
                })}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TaskQueueDialogs
        ledgerId={ledgerId}
        retrySourceDocId={retrySourceDocId}
        deleteConfirm={deleteConfirm}
        onRetrySourceDocIdChange={setRetrySourceDocId}
        onDeleteConfirmChange={(openValue) =>
          setDeleteConfirm((previous) => ({ ...previous, open: openValue }))
        }
        onDeleteConfirm={handleDeleteConfirmAction}
        onRetrySuccess={handleRetrySuccess}
      />
    </>
  );
}

"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTaskQueueModal } from "../client/hooks/use-task-queue-modal";
import { TaskQueueContent } from "./TaskQueueContent";
import { TaskQueueDialogs } from "./TaskQueueDialogs";

interface TaskQueueModalProps {
    ledgerId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TaskQueueModal({
    ledgerId,
    open,
    onOpenChange,
}: TaskQueueModalProps) {
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
                <DialogContent className="sm:max-w-md top-[10%] sm:top-[15%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl max-h-[75vh] flex flex-col" aria-describedby={undefined}>
                    <DialogHeader className="pb-2 border-b border-border shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            <ListTodo className="h-5 w-5" />
                            {t("title")}
                            {stats.total > 0 && (
                                <span className="text-xs font-normal text-muted-foreground bg-surface2 px-1.5 py-0.5 rounded">
                                    {stats.total}
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
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

                    {/* Token Stats Footer */}
                    {stats.completedCount > 0 && (
                        <div className="pt-2 border-t border-border shrink-0">
                            <p className="text-[10px] text-muted-foreground text-center">
                                {t("tokenStats", {
                                    input: stats.totalInputTokens.toLocaleString(),
                                    output: stats.totalOutputTokens.toLocaleString(),
                                    avg: stats.avgTokensPerTask.toLocaleString(),
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
                onDeleteConfirmChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}
                onDeleteConfirm={handleDeleteConfirmAction}
                onRetrySuccess={handleRetrySuccess}
            />
        </>
    );
}

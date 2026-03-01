"use client";

import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QueueItemCard } from "./QueueItemCard";
import { TaskGroupSection } from "./TaskGroupSection";
import { useTaskQueue } from "../client/hooks/useTaskQueue";
import { useTaskQueueMutations } from "../client/hooks/useTaskQueueMutations";
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog";
import { toast } from "sonner";

import { Inbox, ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import { invalidateLedgerCache } from "@/lib/query-keys";
import type { QueueItem } from "../types/queue-item";

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
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();

    const { items, stats, isLoading } = useTaskQueue(ledgerId);
    const {
        deleteSourceDocument,
        batchDelete,
        batchRetry,
        cancelTask,
        dismissTask,
        batchDismiss,
    } = useTaskQueueMutations(ledgerId);

    const [isPendingCollapsed, setIsPendingCollapsed] = useState(false);
    const [isRunningCollapsed, setIsRunningCollapsed] = useState(false);
    const [isFailedCollapsed, setIsFailedCollapsed] = useState(false);
    const [isAnomalyCollapsed, setIsAnomalyCollapsed] = useState(false);
    const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);

    // Edit-Retry Dialog State
    const [retrySourceDocId, setRetrySourceDocId] = useState<string | null>(null);

    // Delete Confirm State
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "single" | "all" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    // Group items by status
    const groupedItems = useMemo(() => {
        const pending: QueueItem[] = [];
        const running: QueueItem[] = [];
        const failed: QueueItem[] = [];
        const completed: QueueItem[] = [];
        const anomaly: QueueItem[] = [];

        for (const item of items) {
            switch (item.status) {
                case "pending":
                    pending.push(item);
                    break;
                case "running":
                    running.push(item);
                    break;
                case "failed":
                    failed.push(item);
                    break;
                case "completed":
                    completed.push(item);
                    break;
                case "anomaly":
                    anomaly.push(item);
                    break;
            }
        }

        return { pending, running, failed, completed, anomaly };
    }, [items]);

    // Handlers
    const handleDeleteConfirmAction = useCallback(() => {
        if (!deleteConfirm.type) return;

        if (deleteConfirm.type === "single" && deleteConfirm.id) {
            deleteSourceDocument.mutate(deleteConfirm.id, {
                onSuccess: () => setDeleteConfirm({ ...deleteConfirm, open: false }),
            });
        } else if (deleteConfirm.type === "all") {
            const ids = groupedItems.failed
                .filter(item => item.sourceDocumentId)
                .map(item => item.sourceDocumentId!);
            batchDelete.mutate(ids, {
                onSuccess: () => setDeleteConfirm({ ...deleteConfirm, open: false }),
            });
        }
    }, [deleteConfirm, deleteSourceDocument, batchDelete, groupedItems.failed]);

    const handleRetry = useCallback((item: QueueItem) => {
        if (item.sourceDocumentId) {
            setRetrySourceDocId(item.sourceDocumentId);
        }
    }, []);

    const handleDeleteSingle = useCallback((item: QueueItem) => {
        if (!item.sourceDocumentId) return;

        setDeleteConfirm({
            open: true,
            type: "single",
            id: item.sourceDocumentId,
            title: t("deleteConfirmTitle"),
            description: t("deleteConfirmDesc"),
        });
    }, [t]);

    const handleDeleteAll = useCallback(() => {
        setDeleteConfirm({
            open: true,
            type: "all",
            id: null,
            title: t("deleteAllConfirmTitle"),
            description: t("deleteAllConfirmDesc"),
        });
    }, [t]);

    const handleRetryAll = useCallback((status: 'failed' | 'anomaly') => {
        const itemsToRetry = groupedItems[status].filter(item => item.sourceDocumentId);
        const ids = itemsToRetry.map(item => item.sourceDocumentId!);
        batchRetry.mutate(ids);
    }, [groupedItems, batchRetry]);

    const handleCancel = useCallback((item: QueueItem) => {
        if (item.taskId) {
            cancelTask.mutate(item.taskId);
        }
    }, [cancelTask]);

    const handleDismiss = useCallback((item: QueueItem) => {
        if (item.taskId) {
            dismissTask.mutate(item.taskId);
        }
    }, [dismissTask]);

    const isEmpty = stats.total === 0 && groupedItems.completed.length === 0;

    // Items with source documents for batch actions
    const failedWithSourceDoc = groupedItems.failed.filter(item => item.sourceDocumentId);
    const failedWithoutSourceDoc = groupedItems.failed.filter(item => !item.sourceDocumentId);

    const handleDismissAll = useCallback(() => {
        const ids = failedWithoutSourceDoc.map(item => item.id);
        if (ids.length > 0) {
            batchDismiss.mutate(ids);
        }
    }, [failedWithoutSourceDoc, batchDismiss]);

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
                        {isLoading ? (
                            <div className="space-y-3 animate-pulse">
                                {[1, 2].map((idx) => (
                                    <div key={idx} className="bg-surface2 rounded-lg h-14" />
                                ))}
                            </div>
                        ) : isEmpty ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Inbox className="h-10 w-10 mb-3 opacity-40" />
                                <p className="font-medium">{t("empty")}</p>
                                <p className="text-xs opacity-70">{t("emptyDesc")}</p>
                            </div>
                        ) : (
                            <>
                                {/* Pending Section */}
                                {groupedItems.pending.length > 0 && (
                                    <TaskGroupSection
                                        title={t("pending")}
                                        count={groupedItems.pending.length}
                                        color="muted"
                                        collapsed={isPendingCollapsed}
                                        onToggle={() => setIsPendingCollapsed(!isPendingCollapsed)}
                                    >
                                        {groupedItems.pending.map((item) => (
                                            <QueueItemCard
                                                key={item.id}
                                                item={item}
                                                ledgerId={ledgerId}
                                                onCancel={() => handleCancel(item)}
                                                onRetry={item.sourceDocumentId ? () => handleRetry(item) : undefined}
                                                onDelete={item.sourceDocumentId ? () => handleDeleteSingle(item) : undefined}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Running Section */}
                                {groupedItems.running.length > 0 && (
                                    <TaskGroupSection
                                        title={t("running")}
                                        count={groupedItems.running.length}
                                        color="primary"
                                        collapsed={isRunningCollapsed}
                                        onToggle={() => setIsRunningCollapsed(!isRunningCollapsed)}
                                    >
                                        {groupedItems.running.map((item) => (
                                            <QueueItemCard
                                                key={item.id}
                                                item={item}
                                                ledgerId={ledgerId}
                                                onCancel={() => handleCancel(item)}
                                                onRetry={item.sourceDocumentId ? () => handleRetry(item) : undefined}
                                                onDelete={item.sourceDocumentId ? () => handleDeleteSingle(item) : undefined}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Failed Section */}
                                {groupedItems.failed.length > 0 && (
                                    <TaskGroupSection
                                        title={t("failed")}
                                        count={groupedItems.failed.length}
                                        color="red"
                                        collapsed={isFailedCollapsed}
                                        onToggle={() => setIsFailedCollapsed(!isFailedCollapsed)}
                                        actions={
                                            (failedWithSourceDoc.length > 0 || failedWithoutSourceDoc.length > 0) && (
                                                <>
                                                    {failedWithoutSourceDoc.length > 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                                                            onClick={handleDismissAll}
                                                        >
                                                            {t("dismissAll")}
                                                        </Button>
                                                    )}
                                                    {failedWithSourceDoc.length > 0 && (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                                                                onClick={handleDeleteAll}
                                                            >
                                                                {t("deleteAll")}
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                className="h-6 px-2 text-xs"
                                                                onClick={() => handleRetryAll('failed')}
                                                            >
                                                                {t("retryAll")}
                                                            </Button>
                                                        </>
                                                    )}
                                                </>
                                            )
                                        }
                                    >
                                        {groupedItems.failed.map((item) => (
                                            <QueueItemCard
                                                key={item.id}
                                                item={item}
                                                ledgerId={ledgerId}
                                                onRetry={item.sourceDocumentId ? () => handleRetry(item) : undefined}
                                                onDelete={item.sourceDocumentId ? () => handleDeleteSingle(item) : undefined}
                                                onDismiss={!item.sourceDocumentId ? () => handleDismiss(item) : undefined}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Anomaly Bills Section */}
                                {groupedItems.anomaly.length > 0 && (
                                    <TaskGroupSection
                                        title={t("anomaly")}
                                        count={groupedItems.anomaly.length}
                                        color="amber"
                                        collapsed={isAnomalyCollapsed}
                                        onToggle={() => setIsAnomalyCollapsed(!isAnomalyCollapsed)}
                                        actions={
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs bg-amber-50/50 text-amber-600 border-amber-100 hover:bg-amber-50 hover:border-amber-200"
                                                    onClick={() => {
                                                        const ids = groupedItems.anomaly.map(item => item.id);
                                                        batchDelete.mutate(ids);
                                                    }}
                                                >
                                                    {t("deleteAll")}
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600"
                                                    onClick={() => handleRetryAll('anomaly')}
                                                >
                                                    {t("retryAll")}
                                                </Button>
                                            </>
                                        }
                                    >
                                        {groupedItems.anomaly.map((item) => (
                                            <QueueItemCard
                                                key={item.id}
                                                item={item}
                                                ledgerId={ledgerId}
                                                onRetry={() => handleRetry(item)}
                                                onDelete={() => handleDeleteSingle(item)}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Completed Section (Last 5) */}
                                {groupedItems.completed.length > 0 && (
                                    <TaskGroupSection
                                        title={t("completed")}
                                        count={groupedItems.completed.length}
                                        color="green"
                                        collapsed={isCompletedCollapsed}
                                        onToggle={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
                                    >
                                        {groupedItems.completed.map((item) => (
                                            <QueueItemCard
                                                key={item.id}
                                                item={item}
                                                ledgerId={ledgerId}
                                                onRetry={item.sourceDocumentId ? () => handleRetry(item) : undefined}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}
                            </>
                        )}
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

            {/* Delete Confirm Dialog */}
            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                onConfirm={handleDeleteConfirmAction}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            {/* Edit-Retry Dialog */}
            {retrySourceDocId && (
                <SourceDocumentEditRetryDialog
                    ledgerId={ledgerId}
                    sourceDocument={{ id: retrySourceDocId }}
                    open={!!retrySourceDocId}
                    onOpenChange={(open) => !open && setRetrySourceDocId(null)}
                    onSuccess={() => {
                        // Toast is shown by SourceDocumentInput, just invalidate here
                        queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
                    }}
                />
            )}
        </>
    );
}

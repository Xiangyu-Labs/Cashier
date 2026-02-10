"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TaskCard } from "./TaskCard";
import { AnomalyBillCard } from "./AnomalyBillCard";
import { TaskGroupSection } from "./TaskGroupSection";
import { useTaskQueue } from "../client/hooks/useTaskQueue";
import { useTaskQueueMutations } from "../client/hooks/useTaskQueueMutations";
import { SerializedTaskRun, SerializedAnomalyBill } from "../server/actions/task-queue";
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog";
import { toast } from "sonner";

import { Inbox, ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import { invalidateLedgerCache } from "@/lib/query-keys";

// Task type constant for matching
const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

function getSourceDocumentIdFromInput(input: unknown): string | null {
    if (typeof input === 'object' && input !== null && 'sourceDocumentId' in input) {
        return (input as { sourceDocumentId?: string }).sourceDocumentId ?? null;
    }
    return null;
}

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
    const tEntries = useTranslations("LedgerEntriesTab");
    const queryClient = useQueryClient();

    const { groups, stats, isLoading } = useTaskQueue(ledgerId);
    const {
        deleteSourceDocument,
        batchDelete,
        batchRetry,
        dismissTask,
        batchDismiss,
    } = useTaskQueueMutations(ledgerId);

    const [isPendingCollapsed, setIsPendingCollapsed] = useState(false);
    const [isRunningCollapsed, setIsRunningCollapsed] = useState(false);
    const [isFailedCollapsed, setIsFailedCollapsed] = useState(false);
    const [isAnomalyCollapsed, setIsAnomalyCollapsed] = useState(false);
    const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);

    // Edit-Retry Dialog State (for parse_source_document tasks)
    const [retryTaskId, setRetryTaskId] = useState<string | null>(null);

    // Delete Confirm State
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "single" | "all" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    // For parse_source_document tasks, extract sourceDocumentId from task input
    const getSourceDocumentId = useCallback((task: SerializedTaskRun): string | null => {
        return getSourceDocumentIdFromInput(task.input);
    }, []);

    // Handlers
    const handleDeleteConfirmAction = useCallback(() => {
        if (!deleteConfirm.type) return;

        if (deleteConfirm.type === "single" && deleteConfirm.id) {
            deleteSourceDocument.mutate(deleteConfirm.id, {
                onSuccess: () => setDeleteConfirm({ ...deleteConfirm, open: false }),
            });
        } else if (deleteConfirm.type === "all") {
            const ids = groups.failed
                .filter(t => t.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT)
                .map(t => getSourceDocumentId(t))
                .filter((id): id is string => id !== null);
            batchDelete.mutate(ids, {
                onSuccess: () => setDeleteConfirm({ ...deleteConfirm, open: false }),
            });
        }
    }, [deleteConfirm, deleteSourceDocument, batchDelete, groups.failed, getSourceDocumentId]);

    const handleRetry = useCallback((task: SerializedTaskRun) => {
        if (task.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT) {
            const sourceDocId = getSourceDocumentIdFromInput(task.input);
            if (sourceDocId) {
                setRetryTaskId(sourceDocId);
            }
        }
    }, []);

    const handleDeleteSingle = useCallback((task: SerializedTaskRun) => {
        const sourceDocId = getSourceDocumentId(task);
        if (!sourceDocId) return;

        setDeleteConfirm({
            open: true,
            type: "single",
            id: sourceDocId,
            title: t("deleteConfirmTitle"),
            description: t("deleteConfirmDesc"),
        });
    }, [t, getSourceDocumentId]);

    const handleDeleteAll = useCallback(() => {
        setDeleteConfirm({
            open: true,
            type: "all",
            id: null,
            title: t("deleteAllConfirmTitle"),
            description: t("deleteAllConfirmDesc"),
        });
    }, [t]);

    const handleRetryAll = useCallback(() => {
        const ids = groups.failed
            .filter(t => t.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT)
            .map(t => getSourceDocumentId(t))
            .filter((id): id is string => id !== null);
        batchRetry.mutate(ids);
    }, [groups.failed, batchRetry, getSourceDocumentId]);

    const isEmpty = stats.total === 0 && groups.completed.length === 0;

    // Check if task type supports actions (all tasks now support some action)
    const supportsActions = () => true;

    // Check if task is a source document parsing task
    const isSourceDocumentTask = (task: SerializedTaskRun) => task.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT;

    // Failed source document tasks for batch actions
    const failedSourceDocTasks = groups.failed.filter(t => t.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT);

    // Failed non-source-document tasks for batch dismiss
    const failedOtherTasks = groups.failed.filter(t => t.type !== TASK_TYPE_PARSE_SOURCE_DOCUMENT);

    const handleDismiss = useCallback((task: SerializedTaskRun) => {
        dismissTask.mutate(task.id);
    }, [dismissTask]);

    const handleDismissAll = useCallback(() => {
        const ids = failedOtherTasks.map(t => t.id);
        batchDismiss.mutate(ids);
    }, [failedOtherTasks, batchDismiss]);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md top-[10%] sm:top-[15%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl max-h-[75vh] flex flex-col">
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
                                {groups.pending.length > 0 && (
                                    <TaskGroupSection
                                        title={t("pending")}
                                        count={groups.pending.length}
                                        color="muted"
                                        collapsed={isPendingCollapsed}
                                        onToggle={() => setIsPendingCollapsed(!isPendingCollapsed)}
                                    >
                                        {groups.pending.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                supportsActions={supportsActions()}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Running Section */}
                                {groups.running.length > 0 && (
                                    <TaskGroupSection
                                        title={t("running")}
                                        count={groups.running.length}
                                        color="primary"
                                        collapsed={isRunningCollapsed}
                                        onToggle={() => setIsRunningCollapsed(!isRunningCollapsed)}
                                    >
                                        {groups.running.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                supportsActions={supportsActions()}
                                                ledgerId={ledgerId}
                                                showSourcePreview={true}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Failed Section */}
                                {groups.failed.length > 0 && (
                                    <TaskGroupSection
                                        title={t("failed")}
                                        count={groups.failed.length}
                                        color="red"
                                        collapsed={isFailedCollapsed}
                                        onToggle={() => setIsFailedCollapsed(!isFailedCollapsed)}
                                        actions={
                                            (failedSourceDocTasks.length > 0 || failedOtherTasks.length > 0) && (
                                                <>
                                                    {failedOtherTasks.length > 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                                                            onClick={handleDismissAll}
                                                        >
                                                            {t("dismissAll")}
                                                        </Button>
                                                    )}
                                                    {failedSourceDocTasks.length > 0 && (
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
                                                                onClick={handleRetryAll}
                                                            >
                                                                {t("retryAll")}
                                                            </Button>
                                                        </>
                                                    )}
                                                </>
                                            )
                                        }
                                    >
                                        {groups.failed.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                supportsActions={supportsActions()}
                                                ledgerId={ledgerId}
                                                showSourcePreview={true}
                                                onRetry={isSourceDocumentTask(task) ? () => handleRetry(task) : undefined}
                                                onDelete={isSourceDocumentTask(task) ? () => handleDeleteSingle(task) : undefined}
                                                onDismiss={!isSourceDocumentTask(task) ? () => handleDismiss(task) : undefined}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Anomaly Bills Section */}
                                {groups.anomaly.length > 0 && (
                                    <TaskGroupSection
                                        title={t("anomaly")}
                                        count={groups.anomaly.length}
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
                                                        const ids = groups.anomaly.map(b => b.id);
                                                        batchDelete.mutate(ids);
                                                    }}
                                                >
                                                    {t("deleteAll")}
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600"
                                                    onClick={() => {
                                                        const ids = groups.anomaly.map(b => b.id);
                                                        batchRetry.mutate(ids);
                                                    }}
                                                >
                                                    {t("retryAll")}
                                                </Button>
                                            </>
                                        }
                                    >
                                        {groups.anomaly.map((bill: SerializedAnomalyBill) => (
                                            <AnomalyBillCard
                                                key={bill.id}
                                                bill={bill}
                                                ledgerId={ledgerId}
                                                onRetry={() => setRetryTaskId(bill.id)}
                                                onDelete={() => {
                                                    setDeleteConfirm({
                                                        open: true,
                                                        type: "single",
                                                        id: bill.id,
                                                        title: t("deleteConfirmTitle"),
                                                        description: t("deleteConfirmDesc"),
                                                    });
                                                }}
                                            />
                                        ))}
                                    </TaskGroupSection>
                                )}

                                {/* Completed Section (Last 5) */}
                                {groups.completed.length > 0 && (
                                    <TaskGroupSection
                                        title={t("completed")}
                                        count={groups.completed.length}
                                        color="green"
                                        collapsed={isCompletedCollapsed}
                                        onToggle={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
                                    >
                                        {groups.completed.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
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

            {/* Edit-Retry Dialog - For parse_source_document tasks */}
            {retryTaskId && (
                <SourceDocumentEditRetryDialog
                    ledgerId={ledgerId}
                    sourceDocument={{ id: retryTaskId }}
                    open={!!retryTaskId}
                    onOpenChange={(open) => !open && setRetryTaskId(null)}
                    onSuccess={() => {
                        toast.success(tEntries("retrySubmitted"));
                        queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
                    }}
                />
            )}
        </>
    );
}

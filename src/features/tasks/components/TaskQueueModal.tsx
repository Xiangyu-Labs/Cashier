"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useTaskQueue } from "../client/hooks/useTaskQueue";
import { SerializedTaskRun, SerializedAnomalyBill } from "../server/actions/task-queue";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import {
    dismissTaskAction,
    batchDismissTasksAction,
} from "../server/actions/dismiss-task";
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog";
import { toast } from "sonner";

import { ChevronDown, Inbox, ListTodo } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { invalidateLedgerCache } from "@/lib/query-keys";

// Task type constant for matching
const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

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

    // For parse_source_document tasks, we need to extract sourceDocumentId from the task
    // This is a project-specific integration point
    const getSourceDocumentId = useCallback((task: SerializedTaskRun): string | null => {
        // The sourceDocumentId is stored in task input when the task is created
        // For now, we use the task.id as a fallback mechanism
        // In practice, you'd need to store/lookup the association
        return task.id; // Placeholder - actual implementation would need task input parsing
    }, []);

    // Mutations for source document tasks
    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (sourceDocumentId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
            // Note: Task queue uses its own data structure, optimistic update handled by UI state
            return { sourceDocumentId };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => {
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchRetryMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onSuccess: () => {
            toast.success(tEntries("retrySubmitted"));
        },
        onError: () => toast.error(tCommon("error")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Dismiss mutations for non-source-document tasks
    const dismissTaskMutation = useMutation({
        mutationFn: async (taskId: string) => {
            await dismissTaskAction(ledgerId, taskId);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: () => toast.error(tCommon("error")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDismissMutation = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await batchDismissTasksAction(ledgerId, taskIds);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: () => toast.error(tCommon("error")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Handlers
    const handleDeleteConfirmAction = useCallback(() => {
        if (!deleteConfirm.type) return;

        if (deleteConfirm.type === "single" && deleteConfirm.id) {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "all") {
            const ids = groups.failed
                .filter(t => t.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT)
                .map(t => getSourceDocumentId(t))
                .filter((id): id is string => id !== null);
            batchDeleteMutation.mutate(ids);
        }
    }, [deleteConfirm, deleteSourceDocumentMutation, batchDeleteMutation, groups.failed, getSourceDocumentId]);

    const handleRetry = useCallback((task: SerializedTaskRun) => {
        if (task.type === TASK_TYPE_PARSE_SOURCE_DOCUMENT) {
            setRetryTaskId(task.id);
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
        batchRetryMutation.mutate(ids);
    }, [groups.failed, batchRetryMutation, getSourceDocumentId]);

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
        dismissTaskMutation.mutate(task.id);
    }, [dismissTaskMutation]);

    const handleDismissAll = useCallback(() => {
        const ids = failedOtherTasks.map(t => t.id);
        batchDismissMutation.mutate(ids);
    }, [failedOtherTasks, batchDismissMutation]);

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
                                    <div className="space-y-2">
                                        <div
                                            className="flex items-center gap-2 px-1 cursor-pointer select-none"
                                            onClick={() => setIsPendingCollapsed(!isPendingCollapsed)}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                                            <span className="text-sm font-medium text-muted-foreground">
                                                {t("pending")} ({groups.pending.length})
                                            </span>
                                            <motion.div
                                                animate={{ rotate: isPendingCollapsed ? -90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                            </motion.div>
                                        </div>

                                        <AnimatePresence>
                                            {!isPendingCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
                                                >
                                                    {groups.pending.map((task) => (
                                                        <TaskCard
                                                            key={task.id}
                                                            task={task}
                                                            supportsActions={supportsActions()}
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Running Section */}
                                {groups.running.length > 0 && (
                                    <div className="space-y-2">
                                        <div
                                            className="flex items-center gap-2 px-1 cursor-pointer select-none"
                                            onClick={() => setIsRunningCollapsed(!isRunningCollapsed)}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm font-medium text-primary">
                                                {t("running")} ({groups.running.length})
                                            </span>
                                            <motion.div
                                                animate={{ rotate: isRunningCollapsed ? -90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronDown className="w-3.5 h-3.5 text-primary" />
                                            </motion.div>
                                        </div>

                                        <AnimatePresence>
                                            {!isRunningCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
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
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Failed Section */}
                                {groups.failed.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                            <div
                                                className="flex items-center gap-2 cursor-pointer select-none"
                                                onClick={() => setIsFailedCollapsed(!isFailedCollapsed)}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                                <span className="text-sm font-medium text-red-500">
                                                    {t("failed")} ({groups.failed.length})
                                                </span>
                                                <motion.div
                                                    animate={{ rotate: isFailedCollapsed ? -90 : 0 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ChevronDown className="w-3.5 h-3.5 text-red-500" />
                                                </motion.div>
                                            </div>

                                            {!isFailedCollapsed && (failedSourceDocTasks.length > 0 || failedOtherTasks.length > 0) && (
                                                <div className="flex items-center gap-1">
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
                                                </div>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {!isFailedCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
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
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Anomaly Bills Section */}
                                {groups.anomaly.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                            <div
                                                className="flex items-center gap-2 cursor-pointer select-none"
                                                onClick={() => setIsAnomalyCollapsed(!isAnomalyCollapsed)}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                <span className="text-sm font-medium text-amber-600">
                                                    {t("anomaly")} ({groups.anomaly.length})
                                                </span>
                                                <motion.div
                                                    animate={{ rotate: isAnomalyCollapsed ? -90 : 0 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ChevronDown className="w-3.5 h-3.5 text-amber-500" />
                                                </motion.div>
                                            </div>

                                            {!isAnomalyCollapsed && groups.anomaly.length > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs bg-amber-50/50 text-amber-600 border-amber-100 hover:bg-amber-50 hover:border-amber-200"
                                                        onClick={() => {
                                                            const ids = groups.anomaly.map(b => b.id);
                                                            batchDeleteMutation.mutate(ids);
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
                                                            batchRetryMutation.mutate(ids);
                                                        }}
                                                    >
                                                        {t("retryAll")}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {!isAnomalyCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
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
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Completed Section (Last 5) */}
                                {groups.completed.length > 0 && (
                                    <div className="space-y-2">
                                        <div
                                            className="flex items-center gap-2 px-1 cursor-pointer select-none"
                                            onClick={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-primary/50" />
                                            <span className="text-sm font-medium text-muted-foreground">
                                                {t("completed")} ({t("recent", { count: groups.completed.length })})
                                            </span>
                                            <motion.div
                                                animate={{ rotate: isCompletedCollapsed ? -90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                            </motion.div>
                                        </div>

                                        <AnimatePresence>
                                            {!isCompletedCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
                                                >
                                                    {groups.completed.map((task) => (
                                                        <TaskCard
                                                            key={task.id}
                                                            task={task}
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
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

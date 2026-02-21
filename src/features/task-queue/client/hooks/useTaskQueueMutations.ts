"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions/main";
import {
    dismissTaskAction,
    batchDismissTasksAction,
} from "@/features/tasks/server/actions/dismiss-task";
import {
    cancelTaskAction,
    batchCancelTasksAction,
} from "../../server/actions/cancel-task";
import type { TaskQueueResult } from "../../server/actions/task-queue";
import type { QueueItem } from "../../types/queue-item";

export function useTaskQueueMutations(ledgerId: string) {
    const queryClient = useQueryClient();
    const t = useTranslations("TaskQueue");
    const tCommon = useTranslations("Common");
    const tEntries = useTranslations("LedgerEntriesTab");

    const taskQueueKey = queryKeys.taskQueue(ledgerId);

    // Helper to remove items from the flat items array
    const removeItemsById = (old: TaskQueueResult | undefined, ids: string[]): TaskQueueResult | undefined => {
        if (!old) return old;
        const idsSet = new Set(ids);
        return {
            ...old,
            items: old.items.filter(item => !idsSet.has(item.id)),
            stats: {
                ...old.stats,
                total: old.stats.total - old.items.filter(item => idsSet.has(item.id)).length,
            },
        };
    };

    // Helper to remove items by sourceDocumentId
    const removeItemsBySourceDocId = (old: TaskQueueResult | undefined, sourceDocIds: string[]): TaskQueueResult | undefined => {
        if (!old) return old;
        const idsSet = new Set(sourceDocIds);
        const newItems = old.items.filter(item => !item.sourceDocumentId || !idsSet.has(item.sourceDocumentId));
        const removedCount = old.items.length - newItems.length;
        return {
            ...old,
            items: newItems,
            stats: {
                ...old.stats,
                total: old.stats.total - removedCount,
            },
        };
    };

    // Delete a single source document (and associated task)
    const deleteSourceDocument = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (sourceDocumentId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsBySourceDocId(old, [sourceDocumentId])
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("deleteFailed"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch delete source documents
    const batchDelete = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsBySourceDocId(old, ids)
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("deleteFailed"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch retry source documents
    const batchRetry = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                const idsSet = new Set(ids);

                // Find items to retry and update their status to pending
                const newItems = old.items.map(item => {
                    if (item.sourceDocumentId && idsSet.has(item.sourceDocumentId)) {
                        return { ...item, status: 'pending' as const, subtitle: undefined };
                    }
                    return item;
                });

                return { ...old, items: newItems };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tEntries("retrySubmitted"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Cancel a single task
    const cancelTask = useMutation({
        mutationFn: async (taskId: string) => {
            await cancelTaskAction(ledgerId, taskId);
        },
        onMutate: async (taskId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsById(old, [taskId])
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("cancelled"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch cancel tasks
    const batchCancel = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await batchCancelTasksAction(ledgerId, taskIds);
        },
        onMutate: async (taskIds) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsById(old, taskIds)
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("cancelled"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Dismiss a single task (for non-source-document tasks)
    const dismissTask = useMutation({
        mutationFn: async (taskId: string) => {
            await dismissTaskAction(ledgerId, taskId);
        },
        onMutate: async (taskId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsById(old, [taskId])
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch dismiss tasks
    const batchDismiss = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await batchDismissTasksAction(ledgerId, taskIds);
        },
        onMutate: async (taskIds) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) =>
                removeItemsById(old, taskIds)
            );

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    return {
        deleteSourceDocument,
        batchDelete,
        batchRetry,
        cancelTask,
        batchCancel,
        dismissTask,
        batchDismiss,
    };
}

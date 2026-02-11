"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import {
    dismissTaskAction,
    batchDismissTasksAction,
} from "../../server/actions/dismiss-task";
import type { TaskQueueResult } from "../../server/actions/task-queue";

export function useTaskQueueMutations(ledgerId: string) {
    const queryClient = useQueryClient();
    const t = useTranslations("TaskQueue");
    const tCommon = useTranslations("Common");
    const tEntries = useTranslations("LedgerEntriesTab");

    const taskQueueKey = queryKeys.taskQueue(ledgerId);

    const deleteSourceDocument = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (sourceDocumentId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            // Optimistically remove the task from all groups
            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                return {
                    ...old,
                    groups: {
                        pending: old.groups.pending.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return input.sourceDocumentId !== sourceDocumentId;
                        }),
                        running: old.groups.running.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return input.sourceDocumentId !== sourceDocumentId;
                        }),
                        failed: old.groups.failed.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return input.sourceDocumentId !== sourceDocumentId;
                        }),
                        completed: old.groups.completed.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return input.sourceDocumentId !== sourceDocumentId;
                        }),
                        anomaly: old.groups.anomaly.filter(bill => bill.id !== sourceDocumentId),
                    },
                };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("deleteFailed"));
            // Rollback on error
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDelete = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            // Optimistically remove multiple tasks
            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                const idsSet = new Set(ids);

                return {
                    ...old,
                    groups: {
                        pending: old.groups.pending.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return !input.sourceDocumentId || !idsSet.has(input.sourceDocumentId);
                        }),
                        running: old.groups.running.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return !input.sourceDocumentId || !idsSet.has(input.sourceDocumentId);
                        }),
                        failed: old.groups.failed.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return !input.sourceDocumentId || !idsSet.has(input.sourceDocumentId);
                        }),
                        completed: old.groups.completed.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return !input.sourceDocumentId || !idsSet.has(input.sourceDocumentId);
                        }),
                        anomaly: old.groups.anomaly.filter(bill => !idsSet.has(bill.id)),
                    },
                };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("deleteFailed"));
            // Rollback on error
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchRetry = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            // Optimistically move tasks from failed to pending
            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                const idsSet = new Set(ids);
                const tasksToRetry = old.groups.failed.filter(task => {
                    const input = task.input as { sourceDocumentId?: string };
                    return input.sourceDocumentId && idsSet.has(input.sourceDocumentId);
                });

                return {
                    ...old,
                    groups: {
                        ...old.groups,
                        failed: old.groups.failed.filter(task => {
                            const input = task.input as { sourceDocumentId?: string };
                            return !input.sourceDocumentId || !idsSet.has(input.sourceDocumentId);
                        }),
                        pending: [...old.groups.pending, ...tasksToRetry.map(task => ({
                            ...task,
                            status: 'pending' as const,
                        }))],
                    },
                };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(tEntries("retrySubmitted"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            // Rollback on error
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const dismissTask = useMutation({
        mutationFn: async (taskId: string) => {
            await dismissTaskAction(ledgerId, taskId);
        },
        onMutate: async (taskId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            // Optimistically remove the task
            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                return {
                    ...old,
                    groups: {
                        pending: old.groups.pending.filter(task => task.id !== taskId),
                        running: old.groups.running.filter(task => task.id !== taskId),
                        failed: old.groups.failed.filter(task => task.id !== taskId),
                        completed: old.groups.completed.filter(task => task.id !== taskId),
                        anomaly: old.groups.anomaly,
                    },
                };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            // Rollback on error
            if (context?.previousTaskQueue) {
                queryClient.setQueryData(taskQueueKey, context.previousTaskQueue);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDismiss = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await batchDismissTasksAction(ledgerId, taskIds);
        },
        onMutate: async (taskIds) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousTaskQueue = queryClient.getQueryData<TaskQueueResult>(taskQueueKey);

            // Optimistically remove multiple tasks
            queryClient.setQueryData<TaskQueueResult>(taskQueueKey, (old) => {
                if (!old) return old;

                const idsSet = new Set(taskIds);

                return {
                    ...old,
                    groups: {
                        pending: old.groups.pending.filter(task => !idsSet.has(task.id)),
                        running: old.groups.running.filter(task => !idsSet.has(task.id)),
                        failed: old.groups.failed.filter(task => !idsSet.has(task.id)),
                        completed: old.groups.completed.filter(task => !idsSet.has(task.id)),
                        anomaly: old.groups.anomaly,
                    },
                };
            });

            return { previousTaskQueue };
        },
        onSuccess: () => {
            toast.success(t("dismissed"));
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("error"));
            // Rollback on error
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
        dismissTask,
        batchDismiss,
    };
}

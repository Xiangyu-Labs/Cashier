"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { invalidateLedgerCache } from "@/lib/query-keys";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import {
    dismissTaskAction,
    batchDismissTasksAction,
} from "../../server/actions/dismiss-task";

export function useTaskQueueMutations(ledgerId: string) {
    const queryClient = useQueryClient();
    const t = useTranslations("TaskQueue");
    const tCommon = useTranslations("Common");
    const tEntries = useTranslations("LedgerEntriesTab");

    const deleteSourceDocument = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (sourceDocumentId) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
            return { sourceDocumentId };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: () => {
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDelete = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchRetry = useMutation({
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

    const dismissTask = useMutation({
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

    const batchDismiss = useMutation({
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

    return {
        deleteSourceDocument,
        batchDelete,
        batchRetry,
        dismissTask,
        batchDismiss,
    };
}

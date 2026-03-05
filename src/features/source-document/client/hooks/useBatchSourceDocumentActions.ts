"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";
import {
    batchUpdateSourceDocumentsAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import type { SourceDocumentWithEntries } from "./useSourceDocuments";

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
    const tCommon = useTranslations("Common");
    const tBatch = useTranslations("BatchActions");

    const batchUpdateDates = useLedgerMutation(ledgerId, {
        mutationFn: async ({ ids, entryDate }: { ids: string[]; entryDate: string }) => {
            await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, { ids }) => {
            toast.success(tBatch("datesUpdated", { count: ids.length }));
            clearSelection();
        },
        onOptimisticUpdate: (queryClient, { ids, entryDate }) => {
            const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
            const snapshots = createListSnapshots<SourceDocumentWithEntries[]>(
                queryClient,
                listKey
            );

            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { queryKey: listKey },
                (old) =>
                    old?.map((doc) =>
                        ids.includes(doc.id) ? { ...doc, entryDate } : doc
                    ) ?? []
            );

            return { snapshots };
        },
    });

    const batchDelete = useLedgerMutation(ledgerId, {
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, ids) => {
            toast.success(tBatch("entriesDeleted", { count: ids.length }));
            clearSelection();
        },
        onOptimisticUpdate: (queryClient, ids) => {
            const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
            const snapshots = createListSnapshots<SourceDocumentWithEntries[]>(
                queryClient,
                listKey
            );

            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { queryKey: listKey },
                (old) => old?.filter((doc) => !ids.includes(doc.id)) ?? []
            );

            return { snapshots };
        },
    });

    const batchRetry = useLedgerMutation(ledgerId, {
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, ids) => {
            toast.success(tBatch("retrySubmitted", { count: ids.length }));
            clearSelection();
        },
        onOptimisticUpdate: (queryClient, ids) => {
            const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
            const snapshots = createListSnapshots<SourceDocumentWithEntries[]>(
                queryClient,
                listKey
            );

            // Move documents to 'queued' status
            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { queryKey: listKey },
                (old) =>
                    old?.map((doc) =>
                        ids.includes(doc.id) ? { ...doc, status: 'queued' as const } : doc
                    ) ?? []
            );

            return { snapshots };
        },
    });

    return {
        batchUpdateDates,
        batchDelete,
        batchRetry,
    };
}

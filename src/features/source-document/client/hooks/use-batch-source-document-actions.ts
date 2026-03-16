"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { matchSourceDocuments } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
    batchUpdateSourceDocumentsAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import type { SourceDocumentWithEntries } from "./use-source-documents";

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
            const snapshots = queryClient.getQueriesData<SourceDocumentWithEntries[]>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) =>
                    old?.map((doc) =>
                        ids.includes(doc.id) ? { ...doc, entryDate } : doc
                    )
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
            const snapshots = queryClient.getQueriesData<SourceDocumentWithEntries[]>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => old?.filter((doc) => !ids.includes(doc.id))
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
            const snapshots = queryClient.getQueriesData<SourceDocumentWithEntries[]>({
                predicate: matchSourceDocuments(ledgerId),
            });

            // Move documents to 'queued' status
            queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) =>
                    old?.map((doc) =>
                        ids.includes(doc.id) ? { ...doc, status: 'queued' as const } : doc
                    )
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

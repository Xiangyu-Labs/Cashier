"use client";

import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import type { LedgerEntry, EntryCategory } from "@/types/api";
import type { SourceDocumentWithEntries } from "@/features/source-document/client/hooks/useSourceDocuments";

// Type alias for query data to avoid inline type assertions
type SourceDocumentsQueryData = SourceDocumentWithEntries[] | undefined;

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
    const tCommon = useTranslations("Common");
    const t = useTranslations("LedgerEntriesTab");

    const listKey = queryKeys.sourceDocuments(ledgerId, 'all');

    const updateEntry = useLedgerMutation<LedgerEntry, { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }>(ledgerId, {
        mutationFn: async ({ ledgerEntryId, data }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            return result;
        },
        successMessage: tCommon("saveSuccess"),
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
            const snapshots = createListSnapshots(queryClient, listKey);

            queryClient.setQueriesData(
                { queryKey: listKey },
                (old: SourceDocumentsQueryData) => {
                    if (!old) return [];
                    return old.map((doc) => {
                        const updatedEntries = doc.ledgerEntries?.map((e) => {
                            if (e.id !== ledgerEntryId) return e;
                            return {
                                ...e,
                                ...data,
                                amount: data.amount !== undefined ? String(data.amount) : e.amount,
                                category: data.categoryId
                                    ? categories.find(c => c.id === data.categoryId) || e.category
                                    : e.category
                            };
                        }) ?? [];
                        return { ...doc, ledgerEntries: updatedEntries };
                    });
                }
            );

            return { snapshots };
        },
    });

    const deleteEntry = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: (ledgerEntryId) => deleteLedgerEntryAction(ledgerId, ledgerEntryId),
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, ledgerEntryId) => {
            const snapshots = createListSnapshots(queryClient, listKey);

            queryClient.setQueriesData(
                { queryKey: listKey },
                (old: SourceDocumentsQueryData) => {
                    if (!old) return [];
                    return old.map((doc) => {
                        const filteredEntries = doc.ledgerEntries?.filter(
                            (e) => e.id !== ledgerEntryId
                        ) ?? [];
                        return { ...doc, ledgerEntries: filteredEntries };
                    });
                }
            );

            return { snapshots };
        },
    });

    const deleteSourceDocument = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: (sourceDocumentId) => deleteSourceDocumentAction(ledgerId, sourceDocumentId),
        successMessage: tCommon("deleteSuccess"),
        errorMessage: t("deleteFailed"),
        onOptimisticUpdate: (queryClient, id) => {
            const snapshots = createListSnapshots(queryClient, listKey);

            queryClient.setQueriesData(
                { queryKey: listKey },
                (old: SourceDocumentsQueryData) => old?.filter(d => d.id !== id) ?? []
            );

            return { snapshots };
        },
    });

    const batchDeleteSourceDocuments = useLedgerMutation<void, string[]>(ledgerId, {
        mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, ids) => {
            const snapshots = createListSnapshots(queryClient, listKey);

            queryClient.setQueriesData(
                { queryKey: listKey },
                (old: SourceDocumentsQueryData) => old?.filter(d => !ids.includes(d.id)) ?? []
            );

            return { snapshots };
        },
    });

    return {
        updateEntry,
        deleteEntry,
        deleteSourceDocument,
        batchDeleteSourceDocuments,
    };
}

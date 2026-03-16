"use client";

import { useTranslations } from "next-intl";
import { matchSourceDocuments } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import type { LedgerEntry, EntryCategory } from "@/types/api";
import type { SourceDocumentWithEntries } from "@/features/source-document/client/hooks/use-source-documents";

// Type alias for query data to avoid inline type assertions
type SourceDocumentsQueryData = SourceDocumentWithEntries[] | undefined;

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
    const tCommon = useTranslations("Common");
    const t = useTranslations("LedgerEntriesTab");

    const updateEntry = useLedgerMutation<LedgerEntry, { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }>(ledgerId, {
        mutationFn: async ({ ledgerEntryId, data }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            return result;
        },
        successMessage: tCommon("saveSuccess"),
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
            // Use predicate to match all source document queries (including date-ranged ones)
            const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentsQueryData>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => {
                    if (!old) return old;
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
            const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentsQueryData>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => {
                    if (!old) return old;
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
            const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentsQueryData>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => old?.filter(d => d.id !== id)
            );

            return { snapshots };
        },
    });

    const batchDeleteSourceDocuments = useLedgerMutation<void, string[]>(ledgerId, {
        mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, ids) => {
            const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentsQueryData>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => old?.filter(d => !ids.includes(d.id))
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

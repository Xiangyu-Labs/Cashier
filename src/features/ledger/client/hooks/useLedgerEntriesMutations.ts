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
} from "@/features/source-document/server/actions/main";
import type { LedgerEntry, EntryCategory, SourceDocument } from "@/types/api";
import type { SourceDocumentGroup } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";

interface UnifiedData {
    groups?: {
        processing?: SourceDocumentGroup[];
        anomaly?: SourceDocumentGroup[];
        completed?: SourceDocumentGroup[];
    };
}

function updateEntriesInGroups(
    groups: SourceDocumentGroup[] | undefined,
    ledgerEntryId: string,
    data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number },
    categories: EntryCategory[]
): SourceDocumentGroup[] | undefined {
    return groups?.map(group => ({
        ...group,
        ledgerEntries: group.ledgerEntries.map(e =>
            e.id === ledgerEntryId
                ? {
                    ...e,
                    ...data,
                    amount: data.amount !== undefined ? String(data.amount) : e.amount,
                    category: data.categoryId
                        ? categories.find(c => c.id === data.categoryId) || e.category
                        : e.category
                } as LedgerEntry
                : e
        )
    }));
}

function filterEntriesFromGroups(
    groups: SourceDocumentGroup[] | undefined,
    ledgerEntryId: string
): SourceDocumentGroup[] | undefined {
    return groups?.map(group => ({
        ...group,
        ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
    }));
}

function filterDocumentsFromGroups(
    groups: SourceDocumentGroup[] | undefined,
    ids: string[]
): SourceDocumentGroup[] | undefined {
    return groups?.filter(g => !ids.includes(g.sourceDocument.id));
}

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
    const tCommon = useTranslations("Common");
    const t = useTranslations("LedgerEntriesTab");

    const updateEntry = useLedgerMutation<LedgerEntry, { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }>(ledgerId, {
        mutationFn: async ({ ledgerEntryId, data }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            return result as unknown as LedgerEntry;
        },
        successMessage: tCommon("saveSuccess"),
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
            const snapshots = createListSnapshots<UnifiedData>(queryClient, queryKeys.sourceDocuments(ledgerId));

            queryClient.setQueriesData<UnifiedData>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: updateEntriesInGroups(old.groups.processing, ledgerEntryId, data, categories),
                            anomaly: updateEntriesInGroups(old.groups.anomaly, ledgerEntryId, data, categories),
                            completed: updateEntriesInGroups(old.groups.completed, ledgerEntryId, data, categories),
                        }
                    };
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
            const snapshots = createListSnapshots<UnifiedData>(queryClient, queryKeys.sourceDocuments(ledgerId));

            queryClient.setQueriesData<UnifiedData>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: filterEntriesFromGroups(old.groups.processing, ledgerEntryId),
                            anomaly: filterEntriesFromGroups(old.groups.anomaly, ledgerEntryId),
                            completed: filterEntriesFromGroups(old.groups.completed, ledgerEntryId),
                        }
                    };
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
            const activeKey = queryKeys.sourceDocuments(ledgerId, "active");
            const snapshots = createListSnapshots<SourceDocument[]>(queryClient, activeKey);

            queryClient.setQueriesData<SourceDocument[]>({ queryKey: activeKey }, (old) =>
                old?.filter(d => d.id !== id) ?? []
            );

            return { snapshots };
        },
    });

    const batchDeleteSourceDocuments = useLedgerMutation<void, string[]>(ledgerId, {
        mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, ids) => {
            const snapshots = createListSnapshots<UnifiedData>(queryClient, queryKeys.sourceDocuments(ledgerId));

            queryClient.setQueriesData<UnifiedData>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: filterDocumentsFromGroups(old.groups.processing, ids),
                            anomaly: filterDocumentsFromGroups(old.groups.anomaly, ids),
                            completed: filterDocumentsFromGroups(old.groups.completed, ids),
                        }
                    };
                }
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

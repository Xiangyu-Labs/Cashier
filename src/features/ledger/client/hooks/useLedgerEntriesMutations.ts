"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import type { LedgerEntry, EntryCategory, SourceDocument } from "@/types/api";
import type { SourceDocumentGroup } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
    const queryClient = useQueryClient();
    const tCommon = useTranslations("Common");
    const t = useTranslations("LedgerEntriesTab");

    const updateEntry = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            return await updateLedgerEntryAction(ledgerId, ledgerEntryId, data) as unknown as LedgerEntry;
        },
        onMutate: async ({ ledgerEntryId, data }) => {
            // Cancel in-flight queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevData = queryClient.getQueriesData({ queryKey: queryKeys.sourceDocuments(ledgerId) });

            // Optimistic update: update the entry in unified source documents
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    const updateEntries = (groups: SourceDocumentGroup[] | undefined): SourceDocumentGroup[] | undefined =>
                        groups?.map(group => ({
                            ...group,
                            ledgerEntries: group.ledgerEntries.map(e =>
                                e.id === ledgerEntryId
                                    ? {
                                        ...e,
                                        ...data,
                                        // Ensure amount stays as string type
                                        amount: data.amount !== undefined ? String(data.amount) : e.amount,
                                        category: data.categoryId
                                            ? categories.find(c => c.id === data.categoryId) || e.category
                                            : e.category
                                    } as LedgerEntry
                                    : e
                            )
                        }));
                    return {
                        ...old,
                        groups: {
                            processing: updateEntries(old.groups.processing),
                            anomaly: updateEntries(old.groups.anomaly),
                            completed: updateEntries(old.groups.completed),
                        }
                    };
                }
            );

            return { prevData };
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: (_err, _vars, ctx) => {
            // Rollback
            if (ctx?.prevData) {
                ctx.prevData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
    });

    const deleteEntry = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
        },
        onMutate: async (ledgerEntryId) => {
            // Cancel in-flight queries to prevent race conditions
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot current state for rollback
            const prevUnified = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, 'unified'));

            // Optimistic update: remove the entry from unified source documents
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: old.groups.processing?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                            anomaly: old.groups.anomaly?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                            completed: old.groups.completed?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                        }
                    };
                }
            );

            return { prevUnified };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _id, ctx) => {
            // Rollback on error
            if (ctx?.prevUnified) {
                queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, 'unified'), ctx.prevUnified);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
    });

    const deleteSourceDocument = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            const prevActive = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, "active"));

            queryClient.setQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"), (old) =>
                old?.filter(d => d.id !== id) || []
            );

            return { prevActive };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (err, id, ctx) => {
            queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "active"), ctx?.prevActive);
            toast.error(t("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDeleteSourceDocuments = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevData = queryClient.getQueriesData({ queryKey: queryKeys.sourceDocuments(ledgerId) });

            // Optimistic update: remove all documents with matching IDs
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    const filterDocs = (groups: SourceDocumentGroup[] | undefined) =>
                        groups?.filter(g => !ids.includes(g.sourceDocument.id));
                    return {
                        ...old,
                        groups: {
                            processing: filterDocs(old.groups.processing),
                            anomaly: filterDocs(old.groups.anomaly),
                            completed: filterDocs(old.groups.completed),
                        }
                    };
                }
            );

            return { prevData };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _ids, ctx) => {
            // Rollback
            if (ctx?.prevData) {
                ctx.prevData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
    });

    return {
        updateEntry,
        deleteEntry,
        deleteSourceDocument,
        batchDeleteSourceDocuments,
    };
}

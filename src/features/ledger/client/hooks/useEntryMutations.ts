"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import type { LedgerEntry, EntryCategory } from "@/types/api";

interface UseEntryMutationsParams {
    ledgerId: string;
    categories: EntryCategory[];
    selectedLedgerEntry: LedgerEntry | null;
    setSelectedLedgerEntry: (entry: LedgerEntry | null) => void;
    setIsDetailModalOpen: (open: boolean) => void;
}

export function useEntryMutations({
    ledgerId,
    categories,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    setIsDetailModalOpen,
}: UseEntryMutationsParams) {
    const queryClient = useQueryClient();
    const tCommon = useTranslations("Common");
    const tLedger = useTranslations("LedgerEntriesTab");

    const updateEntry = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            return await updateLedgerEntryAction(ledgerId, ledgerEntryId, data) as unknown as LedgerEntry;
        },
        onMutate: async ({ ledgerEntryId, data }) => {
            // Cancel in-flight queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevEntries = queryClient.getQueriesData({ queryKey: queryKeys.ledgerEntries(ledgerId) });

            // Optimistic update: update entry in infinite query data
            queryClient.setQueriesData<{ pages?: { items?: LedgerEntry[] }[] }>(
                { queryKey: queryKeys.ledgerEntries(ledgerId) },
                (old) => {
                    if (!old?.pages) return old;
                    return {
                        ...old,
                        pages: old.pages.map(page => ({
                            ...page,
                            items: page.items?.map(e =>
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
                        }))
                    };
                }
            );

            // Also update selected entry immediately for modal
            if (selectedLedgerEntry && selectedLedgerEntry.id === ledgerEntryId) {
                setSelectedLedgerEntry({
                    ...selectedLedgerEntry,
                    ...data,
                    amount: data.amount !== undefined ? String(data.amount) : selectedLedgerEntry.amount,
                    category: data.categoryId
                        ? categories.find(c => c.id === data.categoryId) || selectedLedgerEntry.category
                        : selectedLedgerEntry.category
                } as LedgerEntry);
            }

            return { prevEntries };
        },
        onError: (_err, _vars, ctx) => {
            // Rollback
            if (ctx?.prevEntries) {
                ctx.prevEntries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
    });

    const deleteEntry = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
        },
        onMutate: async (ledgerEntryId) => {
            // Cancel in-flight queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevEntries = queryClient.getQueryData(queryKeys.ledgerEntries(ledgerId));

            // Optimistic update: remove entry from infinite query data
            queryClient.setQueriesData<{ pages?: { items?: LedgerEntry[] }[] }>(
                { queryKey: queryKeys.ledgerEntries(ledgerId) },
                (old) => {
                    if (!old?.pages) return old;
                    return {
                        ...old,
                        pages: old.pages.map(page => ({
                            ...page,
                            items: page.items?.filter(e => e.id !== ledgerEntryId)
                        }))
                    };
                }
            );

            return { prevEntries };
        },
        onSuccess: () => {
            toast.success(tLedger("deleteSuccess"));
            setIsDetailModalOpen(false);
            setSelectedLedgerEntry(null);
        },
        onError: (_err, _id, ctx) => {
            // Rollback
            if (ctx?.prevEntries) {
                queryClient.setQueryData(queryKeys.ledgerEntries(ledgerId), ctx.prevEntries);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
    });

    return {
        updateEntry,
        deleteEntry,
    };
}

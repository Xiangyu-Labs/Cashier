"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import {
    updateSourceDocumentAction,
    deleteSourceDocumentAction
} from "@/features/source-document/server/actions";
import {
    deleteLedgerEntryAction,
    batchUpdateLedgerEntriesAction,
    batchDeleteLedgerEntriesAction,
    updateLedgerEntryAction
} from "@/features/ledger/server/actions/entries";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import type { EntryCategory, LedgerEntry, SourceDocument } from "@/types/api";
import type { EntryEditData } from "@/features/ledger/components/EditableBillEntryItem";

interface SourceDocumentDetailWrapperProps {
    id: string;
    open: boolean;
    onClose: () => void;
    categories: EntryCategory[];
    ledgerEntries?: LedgerEntry[];
}

export function SourceDocumentDetailWrapper({
    id,
    open,
    onClose,
    categories,
    ledgerEntries: initialLedgerEntries
}: SourceDocumentDetailWrapperProps) {
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();

    const { data: sourceDocument, isLoading, error } = useQuery({
        queryKey: queryKeys.sourceDocument(id),
        queryFn: async () => {
            return await getSourceDocumentByIdAction(id);
        },
        enabled: open && !!id,
        retry: false
    });

    const ledgerId = sourceDocument?.ledgerId;

    // Update source document (title, entryDate)
    const updateSourceDocMutation = useMutation({
        mutationFn: async (data: { title?: string; entryDate?: string }) => {
            if (!ledgerId) return;
            await updateSourceDocumentAction(ledgerId, id, data);
        },
        onMutate: async (data) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocument(id) });
            const previousData = queryClient.getQueryData(queryKeys.sourceDocument(id));

            queryClient.setQueryData(queryKeys.sourceDocument(id), (old: any) => {
                if (!old) return old;
                return { ...old, ...data };
            });

            return { previousData };
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousData);
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Update single entry
    const updateEntryMutation = useMutation({
        mutationFn: async ({ entryId, data }: { entryId: string; data: Partial<EntryEditData> }) => {
            if (!ledgerId) return;
            // Convert amount from string to number if present
            const convertedData = {
                ...data,
                amount: data.amount !== undefined ? parseFloat(data.amount) : undefined
            };
            await updateLedgerEntryAction(ledgerId, entryId, convertedData);
        },
        onMutate: async ({ entryId, data }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocument(id) });
            const previousData = queryClient.getQueryData(queryKeys.sourceDocument(id));

            queryClient.setQueryData(queryKeys.sourceDocument(id), (old: any) => {
                if (!old?.ledgerEntries) return old;
                return {
                    ...old,
                    ledgerEntries: old.ledgerEntries.map((entry: any) =>
                        entry.id === entryId ? { ...entry, ...data } : entry
                    )
                };
            });

            return { previousData };
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousData);
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch update entries
    const batchUpdateMutation = useMutation({
        mutationFn: async ({ ids, data }: { ids: string[], data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            if (!ledgerId) return;
            await batchUpdateLedgerEntriesAction(ledgerId, ids, data);
        },
        onMutate: async ({ ids, data }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocument(id) });
            const previousData = queryClient.getQueryData(queryKeys.sourceDocument(id));

            queryClient.setQueryData(queryKeys.sourceDocument(id), (old: any) => {
                if (!old?.ledgerEntries) return old;
                return {
                    ...old,
                    ledgerEntries: old.ledgerEntries.map((entry: any) =>
                        ids.includes(entry.id) ? { ...entry, ...data } : entry
                    )
                };
            });

            return { previousData };
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousData);
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Delete single entry
    const deleteEntryMutation = useMutation({
        mutationFn: async (entryId: string) => {
            if (!ledgerId) return;
            await deleteLedgerEntryAction(ledgerId, entryId);
        },
        onMutate: async (entryId) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocument(id) });
            const previousData = queryClient.getQueryData(queryKeys.sourceDocument(id));

            queryClient.setQueryData(queryKeys.sourceDocument(id), (old: any) => {
                if (!old?.ledgerEntries) return old;
                return {
                    ...old,
                    ledgerEntries: old.ledgerEntries.filter((entry: any) => entry.id !== entryId)
                };
            });

            return { previousData };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousData);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch delete entries
    const batchDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!ledgerId) return;
            await batchDeleteLedgerEntriesAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocument(id) });
            const previousData = queryClient.getQueryData(queryKeys.sourceDocument(id));

            queryClient.setQueryData(queryKeys.sourceDocument(id), (old: any) => {
                if (!old?.ledgerEntries) return old;
                return {
                    ...old,
                    ledgerEntries: old.ledgerEntries.filter((entry: any) => !ids.includes(entry.id))
                };
            });

            return { previousData };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousData);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Delete document
    const deleteDocumentMutation = useMutation({
        mutationFn: async () => {
            if (!ledgerId) return;
            await deleteSourceDocumentAction(ledgerId, id);
        },
        onMutate: async () => {
            if (!ledgerId) return;

            // Cancel outgoing queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousDocument = queryClient.getQueryData(queryKeys.sourceDocument(id));

            // Optimistically remove the document
            queryClient.removeQueries({ queryKey: queryKeys.sourceDocument(id) });

            return { previousDocument, ledgerId };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            onClose();
        },
        onError: (_err, _vars, context) => {
            toast.error(tCommon("deleteFailed"));
            // Rollback on error
            if (context?.previousDocument) {
                queryClient.setQueryData(queryKeys.sourceDocument(id), context.previousDocument);
            }
        },
        onSettled: (_data, _err, _vars, context) => {
            if (context?.ledgerId) {
                queryClient.invalidateQueries({ predicate: invalidateLedgerCache(context.ledgerId) });
            }
        }
    });

    // Handle error state - moved to useEffect to avoid render-path side effects
    useEffect(() => {
        if (error) {
            toast.error(tCommon("error"));
            onClose();
        }
    }, [error, onClose, tCommon]);

    // Handle deleted/not-found case - moved to useEffect
    useEffect(() => {
        if (!isLoading && !sourceDocument && open) {
            onClose();
        }
    }, [isLoading, sourceDocument, open, onClose]);

    const currentLedgerEntries: LedgerEntry[] = sourceDocument
        ? ((sourceDocument as unknown as { ledgerEntries: LedgerEntry[] }).ledgerEntries || initialLedgerEntries || [])
        : [];

    const safeSourceDocument = sourceDocument ? {
        ...sourceDocument,
        status: sourceDocument.status || "queued"
    } as unknown as SourceDocument : null;

    return (
        <SourceDocumentDetailModal
            sourceDocument={safeSourceDocument}
            isLoading={isLoading}
            ledgerEntries={currentLedgerEntries}
            categories={categories}
            open={open}
            onClose={onClose}
            onUpdateSourceDoc={async (data) => await updateSourceDocMutation.mutateAsync(data)}
            onUpdateEntry={async (entryId, data) => await updateEntryMutation.mutateAsync({ entryId, data })}
            onBatchUpdate={async (ids, data) => await batchUpdateMutation.mutateAsync({ ids, data })}
            onDeleteEntry={async (entryId) => await deleteEntryMutation.mutateAsync(entryId)}
            onBatchDelete={async (ids) => await batchDeleteMutation.mutateAsync(ids)}
            onDelete={async () => await deleteDocumentMutation.mutateAsync()}
        />
    );
}


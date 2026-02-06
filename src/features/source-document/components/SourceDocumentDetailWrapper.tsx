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
    updateLedgerEntryAction
} from "@/features/ledger/server/actions/entries";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
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
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
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
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
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
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Batch delete entries
    const batchDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!ledgerId) return;
            for (const entryId of ids) {
                await deleteLedgerEntryAction(ledgerId, entryId);
            }
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
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
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            onClose();
        }
    });

    // Handle error state
    if (error) {
        toast.error(tCommon("error"));
        setTimeout(onClose, 0);
        return null;
    }

    // Handle deleted/not-found case
    if (!isLoading && !sourceDocument && open) {
        setTimeout(onClose, 0);
        return null;
    }

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


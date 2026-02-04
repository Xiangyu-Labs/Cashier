import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/features/ledger/server/actions/get-entry";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import type { EntryCategory, LedgerEntry } from "@/types/api";

interface LedgerEntryDetailWrapperProps {
    id: string;
    open: boolean;
    onClose: () => void;
    categories: EntryCategory[];
}

export function LedgerEntryDetailWrapper({
    id,
    open,
    onClose,
    categories
}: LedgerEntryDetailWrapperProps) {
    const tCommon = useTranslations("Common");
    const push = useModalStackStore(state => state.push);
    const queryClient = useQueryClient();

    const { data: ledgerEntry, isLoading, error } = useQuery({
        queryKey: queryKeys.ledgerEntry(id),
        queryFn: async () => {
            // We need a specific action for fetching a single entry, if not exists we might need to expose it
            // Assuming getLedgerEntryAction exists or we need to add it.
            // For now, I'll assume we can fetch it. If not I'll add the server action.
            const result = await getLedgerEntryAction(id);
            if (!result.success) {
                const errorMsg = typeof result.error === 'string' ? result.error : "Unknown error";
                throw new Error(errorMsg);
            }
            const data = result.data; // Correctly assign result.data to a local variable 'data'
            if (!data) return null;
            return {
                ...data,
                createdAt: data.createdAt.toISOString(),
                entryDate: data.entryDate,
                deletedAt: data.deletedAt ? data.deletedAt.toISOString() : null,
                category: data.category ? {
                    ...data.category,
                    createdAt: data.category.createdAt.toISOString(),
                    updatedAt: data.category.updatedAt.toISOString(),
                    deletedAt: data.category.deletedAt ? data.category.deletedAt.toISOString() : null,
                } : null,
                sourceDocument: data.sourceDocument ? {
                    ...data.sourceDocument,
                    createdAt: data.sourceDocument.createdAt.toISOString(),
                    deletedAt: data.sourceDocument.deletedAt ? data.sourceDocument.deletedAt.toISOString() : null,
                } : null,
            };
        },
        enabled: open && !!id,
        retry: false
    });

    const ledgerId = ledgerEntry?.ledgerId;

    const updateMutation = useMutation({
        mutationFn: async (data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number }) => {
            if (!ledgerId) return;
            const result = await updateLedgerEntryAction(ledgerId, id, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntry(id) });
            // If linked to source doc, usually source doc details refresh is triggered by invalidating keys
            if (ledgerEntry?.sourceDocumentId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(ledgerEntry.sourceDocumentId) });
            }
        },
        onError: () => toast.error(tCommon("saveFailed"))
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!ledgerId) return;
            const result = await deleteLedgerEntryAction(ledgerId, id);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
            if (ledgerEntry?.sourceDocumentId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(ledgerEntry.sourceDocumentId) });
            }
            onClose();
        },
        onError: () => toast.error(tCommon("deleteFailed"))
    });


    if (!isLoading && !ledgerEntry && open) {
        setTimeout(onClose, 0);
        return null;
    }

    if (isLoading && !ledgerEntry) {
        return null;
    }

    if (error) {
        toast.error(tCommon("error"));
        onClose();
        return null;
    }

    if (!ledgerEntry) return null;

    return (
        <LedgerEntryDetailModal
            ledgerEntry={ledgerEntry}
            categories={categories}
            open={open}
            onClose={onClose}
            onUpdate={async (data) => await updateMutation.mutateAsync(data)}
            onDelete={async () => await deleteMutation.mutateAsync()}
            onViewSourceDocument={ledgerEntry.sourceDocumentId ? () => push({ type: 'source-document', id: ledgerEntry.sourceDocumentId! }) : undefined}
        />
    );
}

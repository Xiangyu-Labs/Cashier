import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
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
            const result = await getLedgerEntryAction(id);
            if (!result.success) {
                const errorMsg = typeof result.error === 'string' ? result.error : "Unknown error";
                throw new Error(errorMsg);
            }
            // Data is already formatted with ISO string dates from the server action
            return result.data ?? null;
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
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
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
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            onClose();
        },
        onError: () => toast.error(tCommon("deleteFailed"))
    });


    // Handle error state
    if (error) {
        toast.error(tCommon("error"));
        setTimeout(onClose, 0);
        return null;
    }

    // Handle deleted/not-found case (after loading completes)
    if (!isLoading && !ledgerEntry && open) {
        setTimeout(onClose, 0);
        return null;
    }

    // Always render Modal - pass isLoading for skeleton state
    return (
        <LedgerEntryDetailModal
            ledgerEntry={ledgerEntry ?? null}
            isLoading={isLoading}
            categories={categories}
            open={open}
            onClose={onClose}
            onUpdate={async (data) => await updateMutation.mutateAsync(data)}
            onDelete={async () => await deleteMutation.mutateAsync()}
            onViewSourceDocument={ledgerEntry?.sourceDocumentId ? () => push({ type: 'source-document', id: ledgerEntry.sourceDocumentId! }) : undefined}
        />
    );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/features/ledger/server/actions/get-entry";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

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
        queryFn: () => getLedgerEntryAction(id),
        enabled: open && !!id,
        retry: false
    });

    const ledgerId = ledgerEntry?.ledgerId;

    const updateMutation = useMutation({
        mutationFn: async (data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number }) => {
            if (!ledgerId) return;
            await updateLedgerEntryAction(ledgerId, id, data);
        },
        onMutate: async (data) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ledgerEntry(id) });
            const previousData = queryClient.getQueryData(queryKeys.ledgerEntry(id));

            queryClient.setQueryData(queryKeys.ledgerEntry(id), (old: any) => {
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
                queryClient.setQueryData(queryKeys.ledgerEntry(id), context.previousData);
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!ledgerId) return;
            await deleteLedgerEntryAction(ledgerId, id);
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            onClose();
        },
        onError: () => {
            toast.error(tCommon("deleteFailed"));
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
        if (!isLoading && !ledgerEntry && open) {
            onClose();
        }
    }, [isLoading, ledgerEntry, open, onClose]);

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

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import {
    updateSourceDocumentAction,
    deleteSourceDocumentAction
} from "@/features/source-document/server/actions";
import {
    deleteLedgerEntryAction,
    batchUpdateLedgerEntriesAction
} from "@/features/ledger/server/actions/entries";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface SourceDocumentDetailWrapperProps {
    id: string;
    open: boolean;
    onClose: () => void;
    categories: any[];
    ledgerEntries?: any[]; // Allow override if we already have data (optional optimization)
}

export function SourceDocumentDetailWrapper({
    id,
    open,
    onClose,
    categories,
    ledgerEntries: initialLedgerEntries
}: SourceDocumentDetailWrapperProps) {
    const tCommon = useTranslations("Common");
    const push = useModalStackStore(state => state.push);
    const queryClient = useQueryClient();

    const { data: sourceDocument, isLoading, error } = useQuery({
        queryKey: queryKeys.sourceDocument(id),
        queryFn: async () => {
            const result = await getSourceDocumentByIdAction(id);
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result.data;
        },
        enabled: open && !!id,
        retry: false // Don't retry if deleted
    });

    const ledgerId = sourceDocument?.ledgerId;

    // Mutations
    const updateTitleMutation = useMutation({
        mutationFn: async (title: string) => {
            if (!ledgerId) return;
            const result = await updateSourceDocumentAction(ledgerId, id, { title });
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
        }
    });

    const batchUpdateMutation = useMutation({
        mutationFn: async ({ ids, data }: { ids: string[], data: any }) => {
            if (!ledgerId) return;
            const result = await batchUpdateLedgerEntriesAction(ledgerId, ids, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        }
    });

    const deleteEntryMutation = useMutation({
        mutationFn: async (entryId: string) => {
            if (!ledgerId) return;
            const result = await deleteLedgerEntryAction(ledgerId, entryId);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        }
    });

    const deleteDocumentMutation = useMutation({
        mutationFn: async () => {
            if (!ledgerId) return;
            const result = await deleteSourceDocumentAction(ledgerId, id);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (ledgerId) queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            onClose();
        }
    });


    // Handle deletion case (data becomes null/undefined after cache invalidation)
    if (!isLoading && !sourceDocument && open) {
        // Automatically close if data disappears 
        // We use a timeout to avoid strict mode double-invoke issues
        setTimeout(onClose, 0);
        return null;
    }

    if (isLoading && !sourceDocument) {
        return null; // Or a loading spinner if desired, but modal usually animates in
    }

    if (error) {
        toast.error(tCommon("error"));
        onClose();
        return null;
    }

    // Cast or ensuring non-null for the component
    if (!sourceDocument) return null;

    // The component expects string dates, ensure our data matches
    // getSourceDocumentByIdAction returns strings for dates, so we just need to ensure TYPES match
    // SourceDocument interface usually expects strings for dates in this project
    const safeSourceDocument: any = sourceDocument;

    return (
        <SourceDocumentDetailModal
            sourceDocument={safeSourceDocument}
            ledgerEntries={safeSourceDocument.ledgerEntries || initialLedgerEntries || []}
            categories={categories}
            open={open}
            onClose={onClose}
            onUpdateTitle={async (title) => await updateTitleMutation.mutateAsync(title)}
            onBatchUpdate={async (ids, data) => await batchUpdateMutation.mutateAsync({ ids, data })}
            onDeleteEntry={async (entryId) => await deleteEntryMutation.mutateAsync(entryId)}
            onDelete={async () => await deleteDocumentMutation.mutateAsync()}
            onViewLedgerEntry={(entry) => push({ type: 'ledger-entry', id: entry.id })}
        />
    );
}

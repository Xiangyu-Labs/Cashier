"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import {
    updateSourceDocumentAction,
    deleteSourceDocumentAction,
} from "@/features/source-document/server/actions/main";
import {
    deleteLedgerEntryAction,
    batchUpdateLedgerEntriesAction,
    batchDeleteLedgerEntriesAction,
    updateLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";

import type { EntryCategory, LedgerEntry, SourceDocument } from "@/types/api";
import type { EntryEditData } from "@/features/ledger/components/EditableBillEntryItem";

interface SourceDocumentQueryData extends SourceDocument {
    ledgerEntries: LedgerEntry[];
}

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
    ledgerEntries: initialLedgerEntries,
}: SourceDocumentDetailWrapperProps) {
    const tCommon = useTranslations("Common");

    const { data: sourceDocument, isLoading, error } = useQuery({
        queryKey: queryKeys.sourceDocument(id),
        queryFn: async () => {
            return await getSourceDocumentByIdAction(id);
        },
        enabled: open && !!id,
        retry: false,
    });

    const ledgerId = sourceDocument?.ledgerId;

    // Update source document (title, entryDate)
    const updateSourceDocMutation = useLedgerMutation<
        void,
        { title?: string; entryDate?: string }
    >(ledgerId, {
        mutationFn: async (data) => {
            if (!ledgerId) return;
            await updateSourceDocumentAction(ledgerId, id, data);
        },
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, data) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData(
                { queryKey: snapshotKey },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old) return old;
                    return { ...old, ...data };
                }
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
    });

    // Update single entry
    const updateEntryMutation = useLedgerMutation<
        void,
        { entryId: string; data: Partial<EntryEditData> }
    >(ledgerId, {
        mutationFn: async ({ entryId, data }) => {
            if (!ledgerId) return;
            const convertedData = {
                ...data,
                amount: data.amount !== undefined ? parseFloat(data.amount) : undefined,
            };
            await updateLedgerEntryAction(ledgerId, entryId, convertedData);
        },
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, { entryId, data }) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData(
                { queryKey: snapshotKey },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.map((entry) =>
                            entry.id === entryId ? { ...entry, ...data } : entry
                        ),
                    };
                }
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
    });

    // Batch update entries
    const batchUpdateMutation = useLedgerMutation<
        void,
        { ids: string[]; data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number } }
    >(ledgerId, {
        mutationFn: async ({ ids, data }) => {
            if (!ledgerId) return;
            await batchUpdateLedgerEntriesAction(ledgerId, ids, data);
        },
        errorMessage: tCommon("saveFailed"),
        onOptimisticUpdate: (queryClient, { ids, data }) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData(
                { queryKey: snapshotKey },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.map((entry) =>
                            ids.includes(entry.id) ? { ...entry, ...data } : entry
                        ),
                    };
                }
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
    });

    // Delete single entry
    const deleteEntryMutation = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: async (entryId) => {
            if (!ledgerId) return;
            await deleteLedgerEntryAction(ledgerId, entryId);
        },
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, entryId) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData(
                { queryKey: snapshotKey },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.filter((entry) => entry.id !== entryId),
                    };
                }
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
    });

    // Batch delete entries
    const batchDeleteMutation = useLedgerMutation<void, string[]>(ledgerId, {
        mutationFn: async (ids) => {
            if (!ledgerId) return;
            await batchDeleteLedgerEntriesAction(ledgerId, ids);
        },
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onOptimisticUpdate: (queryClient, ids) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData(
                { queryKey: snapshotKey },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.filter((entry) => !ids.includes(entry.id)),
                    };
                }
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
    });

    // Delete document
    const deleteDocumentMutation = useLedgerMutation<void, void>(ledgerId, {
        mutationFn: async () => {
            if (!ledgerId) return;
            await deleteSourceDocumentAction(ledgerId, id);
        },
        successMessage: tCommon("deleteSuccess"),
        errorMessage: tCommon("deleteFailed"),
        onSuccessExtra: () => {
            onClose();
        },
        onOptimisticUpdate: (queryClient) => {
            const snapshotKey = queryKeys.sourceDocument(id);
            const snapshots = createListSnapshots(queryClient, snapshotKey);

            queryClient.setQueriesData({ queryKey: snapshotKey }, () => undefined);

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) });
        },
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
        ? (
            (sourceDocument as unknown as { ledgerEntries: LedgerEntry[] }).ledgerEntries ||
            initialLedgerEntries ||
            []
        )
        : [];

    const safeSourceDocument = sourceDocument
        ? ({
            ...sourceDocument,
            status: sourceDocument.status || "queued",
        } as unknown as SourceDocument)
        : null;

    return (
        <SourceDocumentDetailModal
            ledgerId={ledgerId || ""}
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

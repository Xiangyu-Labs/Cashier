"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import {
    updateSourceDocumentAction,
    deleteSourceDocumentAction,
} from "@/features/source-document/server/actions";
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
import type { SourceDocumentWithEntries } from "@/features/source-document/client/hooks/useSourceDocuments";

import type { EntryCategory, LedgerEntry } from "@/types/api";
import type { EntryEditData } from "@/features/ledger/components/EditableBillEntryItem";
import type { SourceDocumentWithEntries as ServerSourceDocumentWithEntries } from "@/features/source-document/server/actions/get-document";

// Use the server type for query data (they are compatible)
type SourceDocumentQueryData = ServerSourceDocumentWithEntries;

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Update detail query
            queryClient.setQueriesData(
                { queryKey: queryKeys.sourceDocument(id) },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old) return old;
                    return { ...old, ...data };
                }
            );

            // 2. Update flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots<SourceDocumentWithEntries[]>(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData<SourceDocumentWithEntries[]>(
                    { queryKey: listKey },
                    (old) =>
                        old?.map((doc) =>
                            doc.id === id ? { ...doc, ...data } : doc
                        ) ?? []
                );
            }

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Update detail query
            queryClient.setQueriesData(
                { queryKey: queryKeys.sourceDocument(id) },
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

            // 2. Update flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData(
                    { queryKey: listKey },
                    (old: SourceDocumentWithEntries[] | undefined) => {
                        if (!old) return [];
                        return old.map((doc) => {
                            if (doc.id !== id) return doc;
                            const updatedEntries = doc.ledgerEntries?.map((entry) =>
                                entry.id === entryId
                                    ? { ...entry, ...data }
                                    : entry
                            ) ?? [];
                            return { ...doc, ledgerEntries: updatedEntries };
                        });
                    }
                );
            }

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Update detail query
            queryClient.setQueriesData(
                { queryKey: queryKeys.sourceDocument(id) },
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

            // 2. Update flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData(
                    { queryKey: listKey },
                    (old: SourceDocumentWithEntries[] | undefined) => {
                        if (!old) return [];
                        return old.map((doc) => {
                            if (doc.id !== id) return doc;
                            const updatedEntries = doc.ledgerEntries?.map((entry) =>
                                ids.includes(entry.id)
                                    ? { ...entry, ...data }
                                    : entry
                            ) ?? [];
                            return { ...doc, ledgerEntries: updatedEntries };
                        });
                    }
                );
            }

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Update detail query
            queryClient.setQueriesData(
                { queryKey: queryKeys.sourceDocument(id) },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.filter((entry) => entry.id !== entryId),
                    };
                }
            );

            // 2. Update flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData(
                    { queryKey: listKey },
                    (old: SourceDocumentWithEntries[] | undefined) => {
                        if (!old) return [];
                        return old.map((doc) => {
                            if (doc.id !== id) return doc;
                            const filteredEntries = doc.ledgerEntries?.filter(
                                (entry) => entry.id !== entryId
                            ) ?? [];
                            return { ...doc, ledgerEntries: filteredEntries };
                        });
                    }
                );
            }

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Update detail query
            queryClient.setQueriesData(
                { queryKey: queryKeys.sourceDocument(id) },
                (old: SourceDocumentQueryData | undefined) => {
                    if (!old?.ledgerEntries) return old;
                    return {
                        ...old,
                        ledgerEntries: old.ledgerEntries.filter((entry) => !ids.includes(entry.id)),
                    };
                }
            );

            // 2. Update flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData(
                    { queryKey: listKey },
                    (old: SourceDocumentWithEntries[] | undefined) => {
                        if (!old) return [];
                        return old.map((doc) => {
                            if (doc.id !== id) return doc;
                            const filteredEntries = doc.ledgerEntries?.filter(
                                (entry) => !ids.includes(entry.id)
                            ) ?? [];
                            return { ...doc, ledgerEntries: filteredEntries };
                        });
                    }
                );
            }

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
            const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(id));

            // 1. Remove from detail query
            queryClient.setQueriesData({ queryKey: queryKeys.sourceDocument(id) }, () => undefined);

            // 2. Remove from flat list cache (new architecture)
            if (ledgerId) {
                const listKey = queryKeys.sourceDocuments(ledgerId, 'all');
                const listSnapshots = createListSnapshots(
                    queryClient,
                    listKey
                );
                snapshots.push(...listSnapshots);

                queryClient.setQueriesData(
                    { queryKey: listKey },
                    (old: SourceDocumentWithEntries[] | undefined) => old?.filter((doc) => doc.id !== id) ?? []
                );
            }

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

    // Source document from query includes ledgerEntries directly
    const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];

    // Ensure status has a default value
    const safeSourceDocument = sourceDocument
        ? { ...sourceDocument, status: sourceDocument.status || "queued" }
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

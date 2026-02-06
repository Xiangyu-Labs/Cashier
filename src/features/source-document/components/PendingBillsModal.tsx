"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingBillCard } from "./PendingBillCard";
import { usePendingSourceDocuments } from "../client/hooks/usePendingSourceDocuments";
import { SourceDocumentGroup } from "../client/hooks/useUnifiedSourceDocuments";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "../server/actions";
import { SourceDocument } from "@/types/api";
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog";
import { toast } from "sonner";

import { ChevronDown, Inbox } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";

interface PendingBillsModalProps {
    ledgerId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PendingBillsModal({
    ledgerId,
    open,
    onOpenChange,
}: PendingBillsModalProps) {
    const t = useTranslations("PendingBills");
    const tCommon = useTranslations("Common");
    const tEntries = useTranslations("LedgerEntriesTab");
    const queryClient = useQueryClient();

    const { groups, stats, isLoading } = usePendingSourceDocuments(ledgerId);

    const [isProcessingCollapsed, setIsProcessingCollapsed] = useState(false);
    const [isAnomalyCollapsed, setIsAnomalyCollapsed] = useState(false);

    // Edit-Retry Dialog State
    const [retrySourceDocument, setRetrySourceDocument] = useState<SourceDocument | null>(null);

    // Delete Confirm State
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "single" | "all" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    // Mutations
    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (sourceDocumentId) => {
            // Cancel in-flight queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevPending = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, 'pending'));

            // Optimistic update: remove document from pending groups
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[] }; stats?: object }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId, 'pending') },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: old.groups.processing?.filter(g => g.sourceDocument.id !== sourceDocumentId),
                            anomaly: old.groups.anomaly?.filter(g => g.sourceDocument.id !== sourceDocumentId),
                        }
                    };
                }
            );

            return { prevPending };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (_err, _id, ctx) => {
            // Rollback
            if (ctx?.prevPending) {
                queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, 'pending'), ctx.prevPending);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    const batchRetryMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        onSuccess: () => {
            toast.success(tEntries("retrySubmitted"));
        },
        onError: () => toast.error(tCommon("error")),
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // Handlers
    const handleDeleteConfirmAction = useCallback(() => {
        if (!deleteConfirm.type) return;

        if (deleteConfirm.type === "single" && deleteConfirm.id) {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "all") {
            const ids = groups.anomaly.map((g: SourceDocumentGroup) => g.sourceDocument.id);
            batchDeleteMutation.mutate(ids);
        }
    }, [deleteConfirm, deleteSourceDocumentMutation, batchDeleteMutation, groups.anomaly]);

    const handleRetry = useCallback((doc: SourceDocument) => {
        setRetrySourceDocument(doc);
    }, []);

    const handleDeleteSingle = useCallback((doc: SourceDocument) => {
        setDeleteConfirm({
            open: true,
            type: "single",
            id: doc.id,
            title: t("deleteConfirmTitle"),
            description: t("deleteConfirmDesc"),
        });
    }, [t]);

    const handleDeleteAll = useCallback(() => {
        setDeleteConfirm({
            open: true,
            type: "all",
            id: null,
            title: t("deleteAllConfirmTitle"),
            description: t("deleteAllConfirmDesc"),
        });
    }, [t]);

    const handleRetryAll = useCallback(() => {
        const ids = groups.anomaly.map(g => g.sourceDocument.id);
        batchRetryMutation.mutate(ids);
    }, [groups.anomaly, batchRetryMutation]);

    const isEmpty = stats.total === 0;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md top-[10%] sm:top-[15%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl max-h-[75vh] flex flex-col">
                    <DialogHeader className="pb-2 border-b border-border shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            {t("title")}
                            {!isEmpty && (
                                <span className="text-xs font-normal text-muted-foreground bg-surface2 px-1.5 py-0.5 rounded">
                                    {stats.total}
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
                        {isLoading ? (
                            <div className="space-y-3 animate-pulse">
                                {[1, 2].map((idx) => (
                                    <div key={idx} className="bg-surface2 rounded-lg h-14" />
                                ))}
                            </div>
                        ) : isEmpty ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Inbox className="h-10 w-10 mb-3 opacity-40" />
                                <p className="font-medium">{t("empty")}</p>
                                <p className="text-xs opacity-70">{t("emptyDesc")}</p>
                            </div>
                        ) : (
                            <>
                                {/* Processing Section */}
                                {groups.processing.length > 0 && (
                                    <div className="space-y-2">
                                        <div
                                            className="flex items-center gap-2 px-1 cursor-pointer select-none"
                                            onClick={() => setIsProcessingCollapsed(!isProcessingCollapsed)}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm font-medium text-primary">
                                                {t("processing")} ({groups.processing.length})
                                            </span>
                                            <motion.div
                                                animate={{ rotate: isProcessingCollapsed ? -90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronDown className="w-3.5 h-3.5 text-primary" />
                                            </motion.div>
                                        </div>

                                        <AnimatePresence>
                                            {!isProcessingCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
                                                >
                                                    {groups.processing.map((group: SourceDocumentGroup) => (
                                                        <PendingBillCard
                                                            key={group.sourceDocument.id}
                                                            sourceDocument={group.sourceDocument}
                                                            status="processing"
                                                            onRetry={() => handleRetry(group.sourceDocument as SourceDocument)}
                                                            onDelete={() => handleDeleteSingle(group.sourceDocument as SourceDocument)}
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Anomaly Section */}
                                {groups.anomaly.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                            <div
                                                className="flex items-center gap-2 cursor-pointer select-none"
                                                onClick={() => setIsAnomalyCollapsed(!isAnomalyCollapsed)}
                                            >
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                <span className="text-sm font-medium text-red-500">
                                                    {t("anomaly")} ({groups.anomaly.length})
                                                </span>
                                                <motion.div
                                                    animate={{ rotate: isAnomalyCollapsed ? -90 : 0 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ChevronDown className="w-3.5 h-3.5 text-red-500" />
                                                </motion.div>
                                            </div>

                                            {!isAnomalyCollapsed && (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                                                        onClick={handleDeleteAll}
                                                    >
                                                        {t("deleteAll")}
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs"
                                                        onClick={handleRetryAll}
                                                    >
                                                        {t("retryAll")}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {!isAnomalyCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="space-y-2 overflow-hidden"
                                                >
                                                    {groups.anomaly.map((group: SourceDocumentGroup) => (
                                                        <PendingBillCard
                                                            key={group.sourceDocument.id}
                                                            sourceDocument={group.sourceDocument}
                                                            status="anomaly"
                                                            onRetry={() => handleRetry(group.sourceDocument as SourceDocument)}
                                                            onDelete={() => handleDeleteSingle(group.sourceDocument as SourceDocument)}
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                onConfirm={handleDeleteConfirmAction}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            {/* Edit-Retry Dialog */}
            {retrySourceDocument && (
                <SourceDocumentEditRetryDialog
                    ledgerId={ledgerId}
                    sourceDocument={retrySourceDocument}
                    open={!!retrySourceDocument}
                    onOpenChange={(open) => !open && setRetrySourceDocument(null)}
                    onSuccess={() => {
                        toast.success(tEntries("retrySubmitted"));
                        queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
                    }}
                />
            )}
        </>
    );
}

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";
import { LedgerEntry, EntryCategory, SourceDocument, Ledger } from "@/types/api";
import { SourceDocumentCard } from "@/features/source-document/components/SourceDocumentCard";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { SourceDocumentEditRetryDialog } from "./SourceDocumentEditRetryDialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useTranslations } from "next-intl";
import { useUnifiedSourceDocuments, SourceDocumentGroup } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

interface LedgerEntriesTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    defaultCollapsed?: boolean;
    ledger?: Ledger;
    initialActiveSourceDocuments?: SourceDocument[];
    initialCompletedSourceDocuments?: SourceDocument[];
}

export function LedgerEntriesTab({
    ledgerId,
    categories,
    defaultCollapsed = false,
    ledger,
    initialActiveSourceDocuments,
    initialCompletedSourceDocuments
}: LedgerEntriesTabProps) {
    const t = useTranslations("LedgerEntriesTab");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();


    // Layout Transitions
    const { containerProps, getItemProps, layoutGroupId } = useLayoutTransition();

    // Local State

    const [isProcessingCollapsed, setIsProcessingCollapsed] = useState(defaultCollapsed || (ledger?.metadata?.settings?.collapseProcessingDefault ?? false));
    const [isErrorCollapsed, setIsErrorCollapsed] = useState(defaultCollapsed || (ledger?.metadata?.settings?.collapseProcessingDefault ?? false));
    // Use undefined initially to avoid SSR/Hydration mismatch for date initialization
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});

    // Initialize date range on client side to avoid SSR timezone issues
    useEffect(() => {
        const now = new Date();
        setDateRange({
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        });
    }, []);

    // Modals State
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "sourceDocument" | "batch" | "ledgerEntry" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    // Edit-Retry Dialog State (Keep this local as it's a specialized dialog)
    const [retrySourceDocument, setRetrySourceDocument] = useState<SourceDocument | null>(null);

    const pushModal = useModalStackStore(state => state.push);
    // Unified Data Hook
    const {
        groups,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useUnifiedSourceDocuments(ledgerId, {
        dateRange,
        initialActiveSourceDocuments,
        initialCompletedSourceDocuments
    });

    // --- Mutations ---

    const updateMutation = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result.data as LedgerEntry;
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    const deleteLedgerEntryMutation = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            const result = await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    // Simplified mutations by removing unused batch ones for now (lint)

    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            const result = await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
            if (!result.success) throw new Error(result.error || "Failed to delete source document");
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            const prevActive = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, "active"));

            queryClient.setQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"), (old) =>
                old?.filter(d => d.id !== id) || []
            );

            return { prevActive };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (err, id, ctx) => {
            queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "active"), ctx?.prevActive);
            toast.error(t("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
        }
    });

    // retryMutation was redundant here, removed.

    const batchDeleteSourceDocsMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const result = await batchDeleteSourceDocumentsAction(ledgerId, ids);
            if (!result.success) throw new Error(result.error || "Failed to batch delete");
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (deleteConfirm.open) setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) })
    });

    const batchRetrySourceDocsMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const result = await batchRetrySourceDocumentsAction(ledgerId, ids);
            if (!result.success) throw new Error(result.error || "Failed to batch retry");
        },
        onSuccess: () => {
            toast.success(t("retrySubmitted"));
        },
        onError: () => toast.error(tCommon("error")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) })
    });

    // Handlers
    const handleViewSourceDetail = useCallback((group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
        pushModal({ type: 'source-document', id: group.sourceDocument.id });
    }, [pushModal]);

    const handleRetry = useCallback((doc: SourceDocument) => {
        setRetrySourceDocument(doc);
    }, []);

    const handleDeleteSourceConfirm = useCallback((doc: SourceDocument) => {
        setDeleteConfirm({
            open: true,
            type: "sourceDocument",
            id: doc.id,
            title: t("deleteConfirmTitle"),
            description: t("deleteConfirmDesc")
        });
    }, [t]);

    const handleUpdateLedgerEntry = useCallback((id: string, data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number }) => {
        updateMutation.mutate({ ledgerEntryId: id, data });
    }, [updateMutation]);

    const handleViewLedgerEntry = useCallback((entry: LedgerEntry) => {
        pushModal({ type: 'ledger-entry', id: entry.id });
    }, [pushModal]);

    // Removed unused handlers: handleUpdateTitle, handleBatchUpdate, handleDeleteEntryRequest, handleBatchDelete, handleUpdateLedgerEntryDetail, handleDeleteLedgerEntryRequest

    // Helper Action Handlers
    function handleDeleteConfirmAction() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;

        if (deleteConfirm.type === "sourceDocument") {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "batch") {
            // For safety, batch delete currently only used for anomaly multiple selection which UI doesn't fully support yet mostly,
            // except "Delete All" button which we will implement below.
            // If ID is special "ALL_ERRORS", we handle it specifically or use a new mutation.
            // Wait, the previous logic used deleteSourceDocumentMutation in a loop.
        } else if (deleteConfirm.id === "ALL_ERRORS") {
            const ids = groups.anomaly.map((g: SourceDocumentGroup) => g.sourceDocument.id);
            batchDeleteSourceDocsMutation.mutate(ids);
        } else if (deleteConfirm.type === "ledgerEntry") {
            deleteLedgerEntryMutation.mutate(deleteConfirm.id);
        }

        setDeleteConfirm({ ...deleteConfirm, open: false });
    }

    // --- Render Helpers ---

    function renderSectionHeader(
        title: string,
        count: number,
        isCollapsed: boolean,
        onToggle: () => void,
        colorClass: string,
        iconColorClass: string,
        actions?: React.ReactNode
    ) {
        return (
            <div
                onClick={onToggle}
                className={cn(
                    "flex justify-between items-center min-h-[44px] px-3 border rounded-xl transition-all cursor-pointer select-none",
                    colorClass,
                    "hover:brightness-95 dark:hover:brightness-110 active:scale-[0.99]"
                )}
            >
                <div className="flex items-center gap-2">
                    <h3 className={cn("text-sm font-medium flex items-center gap-2", iconColorClass)}>
                        <span className={cn("w-2 h-2 rounded-full animate-pulse", iconColorClass.replace("text-", "bg-"))}></span>
                        {title} ({count})
                    </h3>
                    <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className={cn("w-4 h-4", iconColorClass)} />
                    </motion.div>
                </div>
                {actions && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {actions}
                    </div>
                )}
            </div>
        );
    }

    // --- Main Render ---



    const handleRefresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
    }, [queryClient, ledgerId]);

    return (
        <LayoutGroup id={layoutGroupId}>
            <PullToRefresh onRefresh={handleRefresh}>
                <div className="space-y-4" {...containerProps}>
                    {/* Date Filter */}
                    <div className="px-2 mb-2 sm:mb-4 pt-1">
                        <DateRangeFilter
                            startDate={dateRange.start}
                            endDate={dateRange.end}
                            onRangeChange={({ start, end }) => setDateRange({ start, end })}
                            className="w-full sm:w-auto"
                        />
                    </div>

                    {/* Unified Loading State */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 min-h-[400px] text-muted-foreground-foreground animate-in fade-in duration-300">
                            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4"></div>
                            <p className="text-sm font-medium">{tCommon("loading")}</p>
                        </div>
                    ) : (
                        <>
                            {/* Processing Section */}
                            <AnimatePresence mode="wait">
                                {groups.processing.length > 0 && (
                                    <motion.div className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        {renderSectionHeader(
                                            t("processing"),
                                            groups.processing.length,
                                            isProcessingCollapsed,
                                            () => setIsProcessingCollapsed(!isProcessingCollapsed),
                                            "bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30 hover:bg-primary/10 dark:hover:bg-primary/20",
                                            "text-primary"
                                        )}
                                        <AnimatePresence>
                                            {!isProcessingCollapsed && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                                    <AnimatePresence mode="wait">
                                                        {groups.processing.map((group: SourceDocumentGroup) => (
                                                            <motion.div key={group.sourceDocument.id} layout layoutId={group.sourceDocument.id} {...getItemProps()}>
                                                                <SourceDocumentCard
                                                                    sourceDocument={group.sourceDocument}
                                                                    ledgerEntries={group.ledgerEntries}
                                                                    categories={categories}
                                                                    status={(group.sourceDocument.status as "queued" | "processing" | "completed" | "anomaly") || 'processing'}
                                                                    className="bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30"
                                                                    defaultExpanded={true}
                                                                    mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                                                                    onRetry={() => setRetrySourceDocument(group.sourceDocument)}
                                                                    onDelete={() => setDeleteConfirm({ open: true, type: "sourceDocument", id: group.sourceDocument.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                                                                />
                                                            </motion.div>
                                                        ))}
                                                    </AnimatePresence>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        <div className="h-px bg-border/50 mt-4 mx-2" />
                                    </motion.div>
                                )}
                            </AnimatePresence>


                            {/* Anomaly Section */}
                            <AnimatePresence mode="wait">
                                {groups.anomaly.length > 0 && (
                                    <motion.div className="space-y-4 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        {renderSectionHeader(
                                            t("abnormal"),
                                            groups.anomaly.length,
                                            isErrorCollapsed,
                                            () => setIsErrorCollapsed(!isErrorCollapsed),
                                            "bg-red-50/40 dark:bg-red-900/10 border-red-100/50 dark:border-red-900/20 hover:bg-red-50/60 dark:hover:bg-red-900/20",
                                            "text-red-500",
                                            <>
                                                <Button variant="outline" size="sm" className="h-7 px-3 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200" onClick={() => setDeleteConfirm({ open: true, id: "ALL_ERRORS", type: "sourceDocument", title: t("deleteAllConfirmTitle"), description: t("deleteAllConfirmDesc") })}>{t("deleteAll")}</Button>
                                                <Button variant="destructive" size="sm" className="h-7 px-3 text-xs shadow-sm" onClick={() => {
                                                    const ids = groups.anomaly.map(g => g.sourceDocument.id);
                                                    batchRetrySourceDocsMutation.mutate(ids);
                                                }}>{t("retryAll")}</Button>
                                            </>
                                        )}
                                        <AnimatePresence>
                                            {!isErrorCollapsed && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                                    <AnimatePresence mode="wait">
                                                        {groups.anomaly.map((group: SourceDocumentGroup) => (
                                                            <motion.div key={group.sourceDocument.id} layout layoutId={group.sourceDocument.id} {...getItemProps()}>
                                                                <SourceDocumentCard
                                                                    sourceDocument={group.sourceDocument}
                                                                    ledgerEntries={group.ledgerEntries}
                                                                    categories={categories}
                                                                    status="anomaly"
                                                                    anomalyCodes={group.sourceDocument.anomalyCodes as string[]}
                                                                    className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                                                                    defaultExpanded={!ledger?.metadata?.settings?.collapseBillsDefault}
                                                                    mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                                                                    onRetry={() => setRetrySourceDocument(group.sourceDocument)}
                                                                    onDelete={() => setDeleteConfirm({ open: true, type: "sourceDocument", id: group.sourceDocument.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                                                                />
                                                            </motion.div>
                                                        ))}
                                                    </AnimatePresence>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        <div className="h-px bg-border/50 mt-4 mx-2" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Completed (Formal) Section */}
                            <div className="space-y-6 px-2">
                                {groups.completed.length === 0 ? (
                                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                                        <span>{tCommon("noRecords")}</span>
                                    </div>
                                ) : (
                                    <AnimatePresence mode="wait">
                                        {groups.completed.map((group: SourceDocumentGroup) => (
                                            <motion.div key={group.sourceDocument.id} className="mb-4 sm:mb-6" layout layoutId={group.sourceDocument.id} {...getItemProps()}>
                                                <SourceDocumentCard
                                                    sourceDocument={group.sourceDocument}
                                                    ledgerEntries={group.ledgerEntries}
                                                    categories={categories}
                                                    status="completed"
                                                    mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                                                    defaultExpanded={!ledger?.metadata?.settings?.collapseBillsDefault}
                                                    onDelete={() => handleDeleteSourceConfirm(group.sourceDocument)}
                                                    onUpdateLedgerEntry={handleUpdateLedgerEntry}
                                                    onRetry={() => handleRetry(group.sourceDocument)}
                                                    onViewDetails={() => handleViewSourceDetail(group)}
                                                    onViewLedgerEntry={handleViewLedgerEntry}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}

                                {/* Infinite Scroll Sentinel */}
                                <div className="h-10 flex items-center justify-center text-muted-foreground text-sm pb-4">
                                    {isFetchingNextPage ? (
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
                                            <span>{tCommon("loading")}</span>
                                        </div>
                                    ) : hasNextPage ? (
                                        <motion.div onViewportEnter={() => fetchNextPage()} className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => fetchNextPage()}>
                                            <span>{t("loadMore")}</span>
                                        </motion.div>
                                    ) : (
                                        <span className="opacity-50 text-xs">{tCommon("noMore")}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </PullToRefresh>

            {/* Global Modal Stack Renderer */}


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
                        toast.success(t("retrySubmitted"));
                        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
                    }}
                />
            )}
        </LayoutGroup>
    );
}

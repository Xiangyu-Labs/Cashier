import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {

    updateLedgerEntry,
    deleteLedgerEntry,
    retrySourceDocument,
    deleteSourceDocument,
    updateSourceDocument,
    batchUpdateLedgerEntries,
    batchDeleteLedgerEntries,
} from "@/lib/api";
import { LedgerEntry, EntryCategory, SourceDocument, Ledger } from "@/types/api";
import { SourceDocumentCard } from "@/components/ledger-entry/SourceDocumentCard";
import { LedgerEntryDetailModal } from "@/components/ledger-entry/LedgerEntryDetailModal";
import { SourceDocumentDetailModal } from "@/components/ledger-entry/SourceDocumentDetailModal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useTranslations } from "next-intl";
import { useUnifiedSourceDocuments } from "@/hooks/useUnifiedSourceDocuments";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { queryKeys } from "@/lib/query-keys";

interface LedgerEntriesTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    defaultCollapsed?: boolean;
    ledger?: Ledger;
}

export function LedgerEntriesTab({
    ledgerId,
    categories,
    defaultCollapsed = false,
    ledger,
}: LedgerEntriesTabProps) {
    const t = useTranslations("LedgerEntriesTab");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();


    // Layout Transitions
    const { containerProps, getItemProps, LayoutGroup } = useLayoutTransition();

    // Local State

    const [isProcessingCollapsed, setIsProcessingCollapsed] = useState(defaultCollapsed);
    const [isErrorCollapsed, setIsErrorCollapsed] = useState(defaultCollapsed);
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    });

    // Modals State
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "sourceDocument" | "batch" | "ledgerEntry" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const [selectedSourceDocument, setSelectedSourceDocument] = useState<{
        sourceDocument: SourceDocument;
        ledgerEntries: LedgerEntry[];
    } | null>(null);
    const [isSourceDetailModalOpen, setIsSourceDetailModalOpen] = useState(false);

    // Unified Data Hook
    const {
        groups,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useUnifiedSourceDocuments(ledgerId, { dateRange });

    // --- Mutations ---

    const updateMutation = useMutation({
        mutationFn: ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Parameters<typeof updateLedgerEntry>[2] }) =>
            updateLedgerEntry(ledgerId, ledgerEntryId, data),
        onSuccess: (updatedEntry) => {
            toast.success(tCommon("saveSuccess"));
            if (selectedLedgerEntry?.id === updatedEntry.id) {
                setSelectedLedgerEntry({
                    ...updatedEntry,
                    category: categories.find(c => c.id === updatedEntry.categoryId) || null,
                    sourceDocument: selectedLedgerEntry.sourceDocument
                });
            }
            if (selectedSourceDocument) {
                const updatedEntries = selectedSourceDocument.ledgerEntries.map(e =>
                    e.id === updatedEntry.id ? updatedEntry : e
                );
                setSelectedSourceDocument({
                    ...selectedSourceDocument,
                    ledgerEntries: updatedEntries
                });
            }
        },
        onError: () => toast.error(tCommon("saveFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    const deleteLedgerEntryMutation = useMutation({
        mutationFn: (ledgerEntryId: string) => deleteLedgerEntry(ledgerId, ledgerEntryId),
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setIsDetailModalOpen(false);
            if (selectedSourceDocument && deleteConfirm.id) {
                const updatedEntries = selectedSourceDocument.ledgerEntries.filter(e => e.id !== deleteConfirm.id);
                setSelectedSourceDocument({
                    ...selectedSourceDocument,
                    ledgerEntries: updatedEntries
                });
            }
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    const batchDeleteLedgerEntriesMutation = useMutation({
        mutationFn: (ledgerEntryIds: string[]) => batchDeleteLedgerEntries(ledgerId, ledgerEntryIds),
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    const batchUpdateLedgerEntriesMutation = useMutation({
        mutationFn: ({ ledgerEntryIds, data }: { ledgerEntryIds: string[], data: Record<string, unknown> }) => batchUpdateLedgerEntries(ledgerId, { ledgerEntryIds, ...data }),
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: () => toast.error(tCommon("saveFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) })
    });

    const updateSourceDocumentMutation = useMutation({
        mutationFn: ({ id, title }: { id: string, title: string }) => updateSourceDocument(ledgerId, id, { title }),
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: () => toast.error(tCommon("saveFailed")),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) })
    });



    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => deleteSourceDocument(ledgerId, sourceDocumentId),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            const prevActive = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, "active"));

            queryClient.setQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"), (old) =>
                old?.filter(d => d.id !== id) || []
            );

            return { prevActive };
        },
        onError: (err, id, ctx) => {
            queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "active"), ctx?.prevActive);
            toast.error(t("deleteFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) })
    });

    const retryMutation = useMutation({
        mutationFn: (id: string) => retrySourceDocument(ledgerId, id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId, "active") });
            const prevActive = queryClient.getQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"));

            queryClient.setQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"), (old) =>
                old?.map(d => d.id === id ? { ...d, status: "processing" as const } : d) || []
            );

            return { prevActive };
        },
        onSuccess: () => toast.success(t("retrySubmitted")),
        onError: (err, id, ctx) => {
            queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "active"), ctx?.prevActive);
            toast.error(tCommon("error"));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) })
    });

    // Helper Action Handlers
    function handleDeleteConfirmAction() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;

        if (deleteConfirm.type === "sourceDocument" || deleteConfirm.type === "batch") {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "ledgerEntry") {
            deleteLedgerEntryMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.id === "ALL_ERRORS") {
            groups.anomaly.forEach(g => deleteSourceDocumentMutation.mutate(g.sourceDocument.id));
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
            <div className={cn(
                "flex justify-between items-center min-h-[44px] px-3 border rounded-xl transition-all group/header",
                colorClass
            )}>
                <button onClick={onToggle} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                    <h3 className={cn("text-sm font-medium flex items-center gap-2", iconColorClass)}>
                        <span className={cn("w-2 h-2 rounded-full animate-pulse", iconColorClass.replace("text-", "bg-"))}></span>
                        {title} ({count})
                    </h3>
                    <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className={cn("w-4 h-4", iconColorClass)} />
                    </motion.div>
                </button>
                {actions && <div className="flex gap-2">{actions}</div>}
            </div>
        );
    }

    // --- Main Render ---



    return (
        <LayoutGroup>
            <div className="space-y-4" {...containerProps}>

                {/* Date Filter */}
                <div className="px-2 mb-2 sm:mb-4">
                    <DateRangeFilter
                        startDate={dateRange.start}
                        endDate={dateRange.end}
                        onRangeChange={({ start, end }) => setDateRange({ start, end })}
                        className="w-full sm:w-auto"
                    />
                </div>

                {/* Unified Loading State */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 min-h-[400px] text-muted-foreground animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4"></div>
                        <p className="text-sm font-medium">{tCommon("loading")}</p>
                    </div>
                ) : (
                    <>
                        {/* Processing Section */}
                        <AnimatePresence mode="popLayout">
                            {groups.processing.length > 0 && (
                                <motion.div layout className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    {renderSectionHeader(
                                        t("processing"),
                                        groups.processing.length,
                                        isProcessingCollapsed,
                                        () => setIsProcessingCollapsed(!isProcessingCollapsed),
                                        "bg-blue-50/40 dark:bg-blue-900/10 border-blue-100/50 dark:border-blue-900/20 hover:bg-blue-50/60 dark:hover:bg-blue-900/20",
                                        "text-blue-500"
                                    )}
                                    <AnimatePresence>
                                        {!isProcessingCollapsed && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                                <AnimatePresence mode="popLayout">
                                                    {groups.processing.map(group => (
                                                        <motion.div key={group.sourceDocument.id} {...getItemProps(group.sourceDocument.id)}>
                                                            <SourceDocumentCard
                                                                sourceDocument={group.sourceDocument}
                                                                ledgerEntries={group.ledgerEntries}
                                                                categories={categories}
                                                                status={group.sourceDocument.status || 'processing'}
                                                                className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                                                                defaultExpanded={true}
                                                                mainCurrency={ledger?.mainCurrency}
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
                        <AnimatePresence mode="popLayout">
                            {groups.anomaly.length > 0 && (
                                <motion.div layout className="space-y-4 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    {renderSectionHeader(
                                        t("abnormal"),
                                        groups.anomaly.length,
                                        isErrorCollapsed,
                                        () => setIsErrorCollapsed(!isErrorCollapsed),
                                        "bg-red-50/40 dark:bg-red-900/10 border-red-100/50 dark:border-red-900/20 hover:bg-red-50/60 dark:hover:bg-red-900/20",
                                        "text-red-500",
                                        <>
                                            <Button variant="outline" size="sm" className="h-7 px-3 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200" onClick={() => setDeleteConfirm({ open: true, id: "ALL_ERRORS", type: "sourceDocument", title: t("deleteAllConfirmTitle"), description: t("deleteAllConfirmDesc") })}>{t("deleteAll")}</Button>
                                            <Button variant="destructive" size="sm" className="h-7 px-3 text-xs shadow-sm" onClick={() => { groups.anomaly.forEach(g => retryMutation.mutate(g.sourceDocument.id)) }}>{t("retryAll")}</Button>
                                        </>
                                    )}
                                    <AnimatePresence>
                                        {!isErrorCollapsed && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                                <AnimatePresence mode="popLayout">
                                                    {groups.anomaly.map(group => (
                                                        <motion.div key={group.sourceDocument.id} {...getItemProps(group.sourceDocument.id)}>
                                                            <SourceDocumentCard
                                                                sourceDocument={group.sourceDocument}
                                                                ledgerEntries={group.ledgerEntries}
                                                                categories={categories}
                                                                status="anomaly"
                                                                anomalyCodes={group.sourceDocument.anomalyCodes}
                                                                className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                                                                defaultExpanded={true}
                                                                mainCurrency={ledger?.mainCurrency}
                                                                onRetry={async () => { await retryMutation.mutateAsync(group.sourceDocument.id); }}
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
                                <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                                    <span className="text-4xl opacity-20">🧾</span>
                                    <span>{t("noRecords")}</span>
                                </div>
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    {groups.completed.map(group => (
                                        <motion.div key={group.sourceDocument.id} className="mb-4 sm:mb-6" {...getItemProps(group.sourceDocument.id)}>
                                            <SourceDocumentCard
                                                sourceDocument={group.sourceDocument}
                                                ledgerEntries={group.ledgerEntries}
                                                categories={categories}
                                                status="completed"
                                                isConfirmed={true}
                                                mainCurrency={ledger?.mainCurrency}
                                                onDelete={() => setDeleteConfirm({ open: true, type: "sourceDocument", id: group.sourceDocument.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                                                onUpdateLedgerEntry={(id, data) => updateMutation.mutate({ ledgerEntryId: id, data })}
                                                onViewDetails={() => {
                                                    setSelectedSourceDocument(group);
                                                    setIsSourceDetailModalOpen(true);
                                                }}
                                                onViewLedgerEntry={(entry) => {
                                                    setSelectedLedgerEntry(entry);
                                                    setIsDetailModalOpen(true);
                                                }}
                                            />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}

                            {/* Infinite Scroll Sentinel */}
                            <div className="h-10 flex items-center justify-center text-muted text-sm pb-4">
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
                                    <span className="opacity-50 text-xs">{t("noMore")}</span>
                                )}
                            </div>
                        </div>
                    </>
                )}

            </div>

            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                onConfirm={handleDeleteConfirmAction}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            <LedgerEntryDetailModal
                ledgerEntry={selectedLedgerEntry}
                categories={categories}
                preferredCurrencies={ledger?.currencies}
                mainCurrency={ledger?.mainCurrency}
                open={isDetailModalOpen}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setSelectedLedgerEntry(null);
                }}
                onUpdate={(data) => {
                    if (selectedLedgerEntry) {
                        updateMutation.mutate({
                            ledgerEntryId: selectedLedgerEntry.id,
                            data,
                        });
                    }
                }}
                onDelete={() => {
                    if (selectedLedgerEntry) {
                        setDeleteConfirm({ open: true, type: "ledgerEntry", id: selectedLedgerEntry.id, title: t("deleteEntryConfirmTitle"), description: t("deleteEntryConfirmDesc") });
                    }
                }}
            />

            <SourceDocumentDetailModal
                sourceDocument={selectedSourceDocument?.sourceDocument || null}
                ledgerEntries={selectedSourceDocument?.ledgerEntries || []}
                categories={categories}
                preferredCurrencies={ledger?.currencies}
                mainCurrency={ledger?.mainCurrency}
                open={isSourceDetailModalOpen}
                onClose={() => {
                    setIsSourceDetailModalOpen(false);
                    setSelectedSourceDocument(null);
                }}
                onUpdateTitle={async (title) => {
                    if (selectedSourceDocument) {
                        await updateSourceDocumentMutation.mutateAsync({ id: selectedSourceDocument.sourceDocument.id, title });
                    }
                }}
                onBatchUpdate={async (ids, data) => {
                    await batchUpdateLedgerEntriesMutation.mutateAsync({ ledgerEntryIds: ids, data });
                }}
                onDeleteEntry={async (id) => {
                    setDeleteConfirm({ open: true, type: "ledgerEntry", id, title: t("deleteEntryConfirmTitle"), description: t("deleteEntryConfirmDesc") });
                }}
                onBatchDelete={async (ids) => {
                    // Trigger batch delete mutation directly or after confirm usually, but here directly as requested within modal logic
                    await batchDeleteLedgerEntriesMutation.mutateAsync(ids);
                }}
            />
        </LayoutGroup>
    );
}

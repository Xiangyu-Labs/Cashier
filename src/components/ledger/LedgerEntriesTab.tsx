import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
    confirmLedgerEntries,
    updateLedgerEntry,
    deleteLedgerEntry,
    retrySourceDocument,
    deleteSourceDocument,
    fetchSourceDocuments,
} from "@/lib/api";
import { LedgerEntry, EntryCategory, SourceDocument, Ledger } from "@/types/api";
import { SourceDocumentCard } from "@/components/ledger-entry/SourceDocumentCard";
import { LedgerEntryDetailModal } from "@/components/ledger-entry/LedgerEntryDetailModal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useTranslations } from "next-intl";

interface LedgerEntriesTabProps {
    ledgerId: string;
    pendingGroups: {
        batches: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }[];
        others: LedgerEntry[];
    };
    confirmedGroups?: {
        batches: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }[];
        others: LedgerEntry[];
    };
    queuedSourceDocuments?: SourceDocument[];
    categories: EntryCategory[];
    defaultCollapsed?: boolean;
    ledger?: Ledger;
}

// Helper types
type PinnedItem =
    | { type: "queue"; date: string; data: SourceDocument }
    | {
        type: "batch";
        status: "pending";
        date: string;
        data: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] };
    }
    | {
        type: "single";
        status: "pending";
        date: string;
        data: LedgerEntry;
    };

export function LedgerEntriesTab({
    ledgerId,
    pendingGroups,
    confirmedGroups,
    queuedSourceDocuments = [],
    categories,
    defaultCollapsed = false,
    ledger,
}: LedgerEntriesTabProps) {
    const t = useTranslations("LedgerEntriesTab");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [confirmingAll, setConfirmingAll] = useState(false);
    const [isPendingConfirmationCollapsed, setIsPendingConfirmationCollapsed] = useState(defaultCollapsed);
    const [isQueuedCollapsed, setIsQueuedCollapsed] = useState(defaultCollapsed);
    const [isErrorCollapsed, setIsErrorCollapsed] = useState(defaultCollapsed);

    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    });

    useEffect(() => {
        setIsPendingConfirmationCollapsed(defaultCollapsed);
        setIsQueuedCollapsed(defaultCollapsed);
        setIsErrorCollapsed(defaultCollapsed);
    }, [defaultCollapsed]);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["sourceDocuments", ledgerId, "all", dateRange.start?.toISOString(), dateRange.end?.toISOString()],
        queryFn: ({ pageParam }) => fetchSourceDocuments(ledgerId, {
            cursor: pageParam,
            startDate: dateRange.start?.toISOString(),
            endDate: dateRange.end?.toISOString(),
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    const allSourceDocuments = (data?.pages.flatMap((page) => page.items) || [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const confirmedEntriesMap = new Map<string, LedgerEntry[]>();
    if (confirmedGroups) {
        confirmedGroups.batches.forEach(batch => {
            confirmedEntriesMap.set(batch.sourceDocument.id, batch.ledgerEntries);
        });
    }

    const updateMutation = useMutation({
        mutationFn: ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Parameters<typeof updateLedgerEntry>[2] }) =>
            updateLedgerEntry(ledgerId, ledgerEntryId, data),
        onSuccess: (updatedEntry) => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({
                variant: "success",
                title: tCommon("saveSuccess"),
            });
            // Update selected entry if it's the one being edited
            if (selectedLedgerEntry && selectedLedgerEntry.id === updatedEntry.id) {
                setSelectedLedgerEntry({
                    ...updatedEntry,
                    category: categories.find(c => c.id === updatedEntry.categoryId) || null,
                    sourceDocument: selectedLedgerEntry.sourceDocument
                });
            }
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: tCommon("saveFailed"),
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (ledgerEntryId: string) => deleteLedgerEntry(ledgerId, ledgerEntryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => deleteSourceDocument(ledgerId, sourceDocumentId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
        onError: () => {
            toast({ variant: "error", title: t("deleteFailed"), description: tCommon("error") });
        }
    });

    const { toast } = useToast();
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "sourceDocument" | "batch" | "ledgerEntry" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    function handleDeleteConfirm() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;
        if (deleteConfirm.type === "sourceDocument" || deleteConfirm.type === "batch") {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "ledgerEntry") {
            deleteMutation.mutate(deleteConfirm.id);
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
        toast({ variant: "success", title: t("deleteSuccess"), description: "" });
    }

    const confirmAllMutation = useMutation({
        mutationFn: () => confirmLedgerEntries(ledgerId, { confirmAll: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            setConfirmingAll(false);
            toast({ variant: "success", title: t("confirmSuccess"), description: "" });
        },
        onError: () => {
            setConfirmingAll(false);
            toast({ variant: "error", title: t("confirmFailed"), description: tCommon("error") });
        },
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (ledgerEntryIds: string[]) => confirmLedgerEntries(ledgerId, { ledgerEntryIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({ variant: "success", title: t("confirmSuccess"), description: "" });
        },
        onError: () => toast({ variant: "error", title: t("confirmFailed"), description: tCommon("error") })
    });

    function isDateInRange(dateStr: string) {
        if (!dateRange.start || !dateRange.end) return true;
        const d = new Date(dateStr).getTime();
        return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    }

    const failedSourceDocuments = (queuedSourceDocuments?.filter((m) => m.status === "error") || [])
        .filter(r => isDateInRange(r.createdAt));
    const processingSourceDocuments = (queuedSourceDocuments?.filter((m) => m.status === "queued" || m.status === "processing") || [])
        .filter(r => isDateInRange(r.createdAt));

    const pinnedSourceDocumentIds = new Set([
        ...failedSourceDocuments.map(r => r.id),
        ...processingSourceDocuments.map(r => r.id),
        ...pendingGroups.batches.filter(b => isDateInRange(b.sourceDocument.createdAt)).map(b => b.sourceDocument.id)
    ]);

    function handleConfirmAll() {
        setConfirmingAll(true);
        confirmAllMutation.mutate();
    }

    async function handleRetryAll() {
        setConfirmingAll(true);
        await Promise.all(failedSourceDocuments.map((doc) => retrySourceDocument(ledgerId, doc.id)));
        queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
        setConfirmingAll(false);
        toast({ variant: "success", title: t("retrySubmitted"), description: t("retryAllDesc") });
    }

    const pendingConfirmationItems: PinnedItem[] = [
        ...pendingGroups.batches
            .filter(batch => isDateInRange(batch.sourceDocument.createdAt))
            .map(batch => ({ type: "batch", status: "pending", date: batch.sourceDocument.createdAt, data: batch } as const)),
        ...pendingGroups.others
            .filter(entry => isDateInRange(entry.createdAt))
            .map(entry => ({ type: "single", status: "pending", date: entry.createdAt, data: entry } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const abnormalItems: PinnedItem[] = [
        ...failedSourceDocuments.map(doc => ({ type: "queue", date: doc.createdAt, data: doc } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const processingItems: PinnedItem[] = [
        ...processingSourceDocuments.map(doc => ({ type: "queue", date: doc.createdAt, data: doc } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    async function handleRetrySourceDocument(docId: string) {
        await retrySourceDocument(ledgerId, docId);
        queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
        toast({ variant: "success", title: t("retrySubmitted"), description: "" });
    }

    function handleDeleteAllErrors() {
        setDeleteConfirm({
            open: true,
            type: "sourceDocument",
            id: "ALL_ERRORS",
            title: t("deleteAllConfirmTitle"),
            description: t("deleteAllConfirmDesc")
        });
    }

    async function handleDeleteConfirmAction() {
        if (deleteConfirm.id === "ALL_ERRORS") {
            try {
                await Promise.all(failedSourceDocuments.map(r => deleteSourceDocument(ledgerId, r.id)));
                queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
                toast({ variant: "success", title: t("deleteSuccess"), description: "" });
            } catch (error) {
                console.error("Failed to delete abnormal source documents:", error);
                toast({ variant: "error", title: t("deleteFailed"), description: "" });
            }
        } else {
            handleDeleteConfirm();
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
    }


    function renderPinnedItem(item: PinnedItem) {
        const key = item.type === "queue" ? item.data.id : item.type === "batch" ? item.data.sourceDocument.id : item.data.id;
        let className = "";
        let onRetryProp = undefined;

        if (item.type === "queue" && item.data.status === "error") {
            className = "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800";
            onRetryProp = () => handleRetrySourceDocument(item.data.id);
        } else if (item.type === "queue" && (item.data.status === "queued" || item.data.status === "processing")) {
            className = "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800";
        } else {
            className = "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800";
        }

        const content = (() => {
            if (item.type === "queue") {
                return <SourceDocumentCard
                    sourceDocument={item.data}
                    ledgerEntries={[]}
                    categories={categories}
                    status={item.data.status || 'processing'}
                    errorCode={item.data.errorCode}
                    className={className}
                    defaultExpanded={true}
                    onRetry={onRetryProp}
                    onDelete={() => setDeleteConfirm({ open: true, type: "sourceDocument", id: item.data.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                />;
            }
            if (item.type === "batch") {
                return <SourceDocumentCard
                    sourceDocument={item.data.sourceDocument}
                    ledgerEntries={item.data.ledgerEntries}
                    categories={categories}
                    status="pending"
                    className={className}
                    defaultExpanded={true}
                    onConfirm={async (ids) => { await confirmBatchMutation.mutateAsync(ids); }}
                    onUpdateLedgerEntry={(id, data) => updateMutation.mutate({ ledgerEntryId: id, data })}
                    onDeleteLedgerEntry={(id) => setDeleteConfirm({ open: true, type: "ledgerEntry", id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                    onDelete={() => setDeleteConfirm({ open: true, type: "batch", id: item.data.sourceDocument.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                    onViewLedgerEntry={(entry) => {
                        setSelectedLedgerEntry(entry);
                        setIsDetailModalOpen(true);
                    }}
                />;
            }
            if (item.type === "single") {
                return (
                    <div className={`p-4 rounded-xl border ${className}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted">{t("manualRecord")}</span>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteConfirm({ open: true, type: "ledgerEntry", id: item.data.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}><span className="sr-only">Delete</span>🗑️</Button>
                        </div>
                        <div className="text-sm">{item.data.itemName} - {item.data.amount} {item.data.currency}</div>
                    </div>
                );
            }
            return null;
        })();

        if (!content) return null;
        return (
            <motion.div key={key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                {content}
            </motion.div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="px-2 mb-2 sm:mb-4">
                <DateRangeFilter
                    startDate={dateRange.start}
                    endDate={dateRange.end}
                    onRangeChange={({ start, end }) => setDateRange({ start, end })}
                    className="w-full sm:w-auto"
                />
            </div>

            <AnimatePresence mode="popLayout">
                {processingItems.length > 0 && (
                    <motion.div layout className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-blue-50/40 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl transition-all group/header hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
                            <button onClick={() => setIsQueuedCollapsed(!isQueuedCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-blue-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    {t("processing")} ({processingItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isQueuedCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-blue-500" />
                                </motion.div>
                            </button>
                        </div>
                        <AnimatePresence>
                            {!isQueuedCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {processingItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
                {pendingConfirmationItems.length > 0 && (
                    <motion.div layout className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-yellow-50/40 dark:bg-yellow-900/10 border border-yellow-100/50 dark:border-yellow-900/20 rounded-xl transition-all group/header hover:bg-yellow-50/60 dark:hover:bg-yellow-900/20">
                            <button onClick={() => setIsPendingConfirmationCollapsed(!isPendingConfirmationCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-warning flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                                    {t("pending")} ({pendingConfirmationItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isPendingConfirmationCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-warning" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                <Button variant="default" onClick={handleConfirmAll} disabled={confirmAllMutation.isPending || confirmingAll} size="sm" className="h-7 px-3 text-xs bg-warning text-warning-foreground hover:bg-warning/90 shadow-sm transition-all active:scale-95">{confirmAllMutation.isPending ? t("confirming") : t("confirmAll")}</Button>
                            </div>
                        </div>
                        <AnimatePresence>
                            {!isPendingConfirmationCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {pendingConfirmationItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
                {abnormalItems.length > 0 && (
                    <motion.div layout className="space-y-4 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-red-50/40 dark:bg-red-900/10 border border-red-100/50 dark:border-red-900/20 rounded-xl transition-all group/header hover:bg-red-50/60 dark:hover:bg-red-900/20">
                            <button onClick={() => setIsErrorCollapsed(!isErrorCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-red-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    {t("abnormal")} ({abnormalItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isErrorCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-red-500" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="h-7 px-3 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200 transition-all active:scale-95" onClick={handleDeleteAllErrors}>{t("deleteAll")}</Button>
                                <Button variant="destructive" size="sm" className="h-7 px-3 text-xs shadow-sm transition-all active:scale-95" disabled={confirmingAll} onClick={handleRetryAll}>{t("retryAll")}</Button>
                            </div>
                        </div>
                        <AnimatePresence>
                            {!isErrorCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {abnormalItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-6 px-2">
                {isLoading ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin"></span>
                        <span>{tCommon("loading")}</span>
                    </div>
                ) : allSourceDocuments.length === 0 ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">🧾</span>
                        <span>{t("noRecords")}</span>
                    </div>
                ) : (
                    <>
                        {allSourceDocuments
                            .filter(doc => !pinnedSourceDocumentIds.has(doc.id))
                            .map((doc) => {
                                const entries = confirmedEntriesMap.get(doc.id) || [];
                                return (
                                    <div key={doc.id} className="mb-4 sm:mb-6">
                                        <SourceDocumentCard
                                            sourceDocument={doc}
                                            ledgerEntries={entries}
                                            categories={categories}
                                            status={doc.status || 'completed'}
                                            isConfirmed={true}
                                            onDelete={() => setDeleteConfirm({ open: true, type: "sourceDocument", id: doc.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                                            onUpdateLedgerEntry={(id, data) => updateMutation.mutate({ ledgerEntryId: id, data })}
                                            onDeleteLedgerEntry={(id) => deleteMutation.mutate(id)}
                                            onViewLedgerEntry={(entry) => {
                                                setSelectedLedgerEntry(entry);
                                                setIsDetailModalOpen(true);
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        {/* Sentinel for Infinite Scroll */}
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
                    </>
                )}
            </div>

            <ConfirmDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} title={deleteConfirm.title} description={deleteConfirm.description} onConfirm={handleDeleteConfirmAction} variant="destructive" confirmLabel={tCommon("delete")} />

            <LedgerEntryDetailModal
                ledgerEntry={selectedLedgerEntry}
                categories={categories}
                preferredCurrencies={ledger?.currencies}
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
                        deleteMutation.mutate(selectedLedgerEntry.id);
                    }
                }}
            />
        </div>
    );
}

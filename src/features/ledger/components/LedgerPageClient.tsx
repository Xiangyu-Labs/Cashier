"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchLedger, fetchLedgers, fetchEntryCategories } from "@/lib/fetchers";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerEntriesTab } from "./LedgerEntriesTab";
import { DetailsTab } from "./DetailsTab";
import { StatsTab } from "./StatsTab";
import { SettingsTab } from "./SettingsTab";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "@/features/source-document/components/SourceDocumentInput";
import { PendingBillsModal } from "@/features/source-document/components/PendingBillsModal";
import { usePendingSourceDocuments } from "@/features/source-document/client/hooks/usePendingSourceDocuments";
import { LedgerSwitcher } from "./LedgerSwitcher";
import { useTranslations } from "next-intl";
import { Ledger, EntryCategory } from "@/types/api";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";

interface LedgerPageClientProps {
    ledgerId: string;
}

const STALE_TIME = 5 * 60 * 1000; // 5 minutes - must match server prefetch

export function LedgerPageClient({ ledgerId }: LedgerPageClientProps) {
    const t = useTranslations("LedgerPage");
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Read from hydration cache using the SAME fetchers as server prefetch
    // This ensures perfect hydration - no additional requests on first render
    const { data: ledger } = useQuery({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => fetchLedger(ledgerId),
        staleTime: STALE_TIME,
    });

    const { data: categories = [] } = useQuery({
        queryKey: queryKeys.entryCategories(ledgerId),
        queryFn: () => fetchEntryCategories(ledgerId),
        staleTime: STALE_TIME,
    });

    const { data: allLedgers = [] } = useQuery({
        queryKey: queryKeys.ledgers(),
        queryFn: () => fetchLedgers(),
        staleTime: STALE_TIME,
    });

    // Initialize from URL, then manage with state for instant switching
    const [activeTab, setActiveTab] = useState(
        () => searchParams.get("tab") || "history"
    );

    const handleTabChange = (value: string) => {
        // Instant client-side update
        setActiveTab(value);
        // Update URL without triggering navigation (preserves state on refresh)
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", value);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    };

    const [isInputOpen, setIsInputOpen] = useState(false);
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    // Fetch pending bills count for the header button
    const { stats: pendingStats } = usePendingSourceDocuments(ledgerId);

    if (!ledger) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg">
                <p className="text-muted">{t("notFound")}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg text-text">
            {/* Top Navigation */}
            <header className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-md bg-surface/80 supports-[backdrop-filter]:bg-surface/60">
                <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center transition-all duration-300">
                    <div className="flex items-center gap-2">
                        {/* Pass ledgers to Switcher to avoid internal fetching */}
                        <LedgerSwitcher
                            currentLedgerId={ledgerId}
                            currentLedgerName={ledger.name}
                            ledgers={allLedgers}
                        />

                        {/* Processing Bills Button - Only show if there are processing items */}
                        {pendingStats.processingCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsPendingOpen(true)}
                                className="h-8 px-2 gap-1 text-xs font-medium rounded-full text-primary hover:bg-primary/10"
                            >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>{pendingStats.processingCount}</span>
                            </Button>
                        )}

                        {/* Anomaly Bills Button - Only show if there are anomaly items */}
                        {pendingStats.anomalyCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsPendingOpen(true)}
                                className="h-8 px-2 gap-1 text-xs font-medium rounded-full text-red-500 hover:bg-red-500/10"
                            >
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>{pendingStats.anomalyCount}</span>
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">

                        <Button
                            size="sm"
                            onClick={() => setIsInputOpen(true)}
                            className="hidden md:flex rounded-full h-8 w-8 p-0"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </header >

            <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4 transition-all duration-300">
                <Tabs
                    value={activeTab}
                    onValueChange={handleTabChange}
                    className="w-full space-y-4"
                >
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="history">{t("history")}</TabsTrigger>
                        <TabsTrigger value="details">{t("details")}</TabsTrigger>
                        <TabsTrigger value="stats">{t("stats")}</TabsTrigger>
                        <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="history" className="mt-0">
                        <LedgerEntriesTab
                            ledgerId={ledgerId}
                            categories={categories || []}
                            defaultCollapsed={ledger.metadata?.settings?.collapseProcessingDefault || false}
                            ledger={ledger}
                        />
                    </TabsContent>

                    <TabsContent value="details" className="mt-0">
                        <DetailsTab
                            ledgerId={ledgerId}
                            categories={categories || []}
                            ledger={ledger}
                        />
                    </TabsContent>

                    <TabsContent value="stats" className="mt-0">
                        <StatsTab ledgerId={ledgerId} ledger={ledger} />
                    </TabsContent>

                    <TabsContent value="settings" className="mt-0">
                        <SettingsTab
                            ledgerId={ledgerId}
                            ledger={ledger}
                            initialCategories={categories}
                        />
                    </TabsContent>
                </Tabs>
            </main>

            <Dialog open={isInputOpen} onOpenChange={setIsInputOpen}>
                <DialogContent className="sm:max-w-md top-[15%] sm:top-[20%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl">
                    <DialogHeader>
                        <DialogTitle>{t("newRecord")}</DialogTitle>
                    </DialogHeader>
                    <SourceDocumentInput
                        ledgerId={ledgerId}
                        onSuccess={() => setIsInputOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Pending Bills Modal */}
            <PendingBillsModal
                ledgerId={ledgerId}
                open={isPendingOpen}
                onOpenChange={setIsPendingOpen}
            />

            {/* Mobile Floating Action Button (FAB) */}
            <div className="fixed bottom-6 right-6 z-50 md:hidden">
                <Button
                    size="lg"
                    onClick={() => setIsInputOpen(true)}
                    className="rounded-full h-14 w-14 p-0 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus className="h-6 w-6" />
                </Button>
            </div>

            <ModalStackRenderer categories={categories} />
        </div >
    );
}


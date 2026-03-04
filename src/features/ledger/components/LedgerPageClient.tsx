"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle, Clock, ListTodo } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerEntriesTab } from "./LedgerEntriesTab";
import { DetailsTab } from "./DetailsTab";
import { StatsTab } from "./StatsTab";
import { SettingsTab } from "./SettingsTab";
import { CalendarTab } from "@/features/calendar/components/CalendarTab";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "@/features/source-document/components/SourceDocumentInput";
import { QuickEntryForm } from "@/features/source-document/components/QuickEntryForm";
import { cn } from "@/lib/utils";
import { TaskQueueModal } from "@/features/task-queue/components/TaskQueueModal";
import { useTaskQueue } from "@/features/task-queue/client/hooks/useTaskQueue";
import { useTranslations } from "next-intl";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";
import { PeriodParams } from "@/lib/period-utils";
import { usePeriodFilter } from "@/features/ledger/client/hooks/usePeriodFilter";

interface LedgerPageClientProps {
    ledgerId: string;
    initialPeriod: PeriodParams;
}

const STALE_TIME = 10 * 60 * 1000; // 10 minutes - must match server prefetch

export function LedgerPageClient({ ledgerId, initialPeriod }: LedgerPageClientProps) {
    const t = useTranslations("LedgerPage");
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Read from hydration cache using the SAME Actions as server prefetch
    // This ensures perfect hydration - no additional requests on first render
    const { data: ledger } = useQuery({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => getLedgerAction(ledgerId),
        staleTime: STALE_TIME,
    });

    const { data: categories = [] } = useQuery({
        queryKey: queryKeys.entryCategories(ledgerId),
        queryFn: () => getEntryCategoriesAction(ledgerId),
        staleTime: STALE_TIME,
    });

    const { data: allLedgers = [] } = useQuery({
        queryKey: queryKeys.ledgers(),
        queryFn: () => getLedgersAction(),
        staleTime: STALE_TIME,
    });

    // Initialize from URL, then manage with state for instant switching
    const [activeTab, setActiveTab] = useState(
        () => searchParams.get("tab") || "history"
    );

    // Lift advanced filters state to page level - shared across tabs for drilldown
    const [advancedFilters, setAdvancedFilters] = useState<{
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }>(() => ({
        categoryId: null,
        currency: null,
        minAmount: null,
        maxAmount: null,
    }));

    // Lift period filter state to page level - shared across all tabs
    const monthStartDay = ledger?.metadata?.settings?.monthStartDay || 1;
    const {
        periodParams,
        dateRange: _dateRange,
        filters: _filters,
        handlePeriodChange,
        handleFiltersChange,
    } = usePeriodFilter({ pathname, searchParams, initialPeriod, monthStartDay });

    const handleTabChange = (value: string) => {
        // Instant client-side update
        setActiveTab(value);
        // Update URL without triggering navigation (preserves state on refresh)
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", value);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    };

    const handleCategoryDrilldown = useCallback((categoryId: string, startDate: string, endDate: string) => {
        // 1. Update all React state atomically (skip individual URL updates)
        setAdvancedFilters(prev => ({
            ...prev,
            categoryId: categoryId === "__uncategorized__" ? null : categoryId,
        }));
        setActiveTab("details");
        handlePeriodChange({ period: 'custom', startDate, endDate }, { skipUrlUpdate: true });

        // 2. Single atomic URL update with ALL params
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "details");
        params.set("period", "custom");
        params.set("startDate", startDate);
        params.set("endDate", endDate);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    }, [searchParams, pathname, handlePeriodChange]);

    const handleAdvancedFiltersChange = useCallback((filters: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }) => {
        setAdvancedFilters(filters);
    }, []);

    const [isInputOpen, setIsInputOpen] = useState(false);
    const [inputMode, setInputMode] = useState<"ai" | "quick">("ai");
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    // Fetch task queue data for the header button
    const { stats: pendingStats } = useTaskQueue(ledgerId);

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
                        {/* Static ledger name */}
                        <span className="text-lg font-bold truncate max-w-[100px] sm:max-w-[150px]">
                            {ledger.name}
                        </span>

                        {/* Task Queue Button - Unified pill showing queued/running/failed counts */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsPendingOpen(true)}
                            className="h-8 px-2 gap-1.5 text-xs font-medium rounded-full hover:bg-surface2"
                        >
                            {/* Show counts when present, otherwise just icon */}
                            {pendingStats.total > 0 ? (
                                <>
                                    {/* Pending count */}
                                    {pendingStats.pendingCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span>{pendingStats.pendingCount}</span>
                                        </span>
                                    )}
                                    {/* Running count */}
                                    {pendingStats.runningCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-primary">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span>{pendingStats.runningCount}</span>
                                        </span>
                                    )}
                                    {/* Failed count */}
                                    {pendingStats.failedCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-red-500">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            <span>{pendingStats.failedCount}</span>
                                        </span>
                                    )}
                                    {/* Anomaly count */}
                                    {pendingStats.anomalyCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-amber-500">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            <span>{pendingStats.anomalyCount}</span>
                                        </span>
                                    )}
                                </>
                            ) : (
                                <ListTodo className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">

                        <Button
                            size="sm"
                            onClick={() => setIsInputOpen(true)}
                            className="rounded-full h-8 w-8 p-0"
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
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="history">{t("history")}</TabsTrigger>
                        <TabsTrigger value="details">{t("details")}</TabsTrigger>
                        <TabsTrigger value="calendar">{t("calendar")}</TabsTrigger>
                        <TabsTrigger value="stats">{t("stats")}</TabsTrigger>
                        <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="history" className="mt-0">
                        <LedgerEntriesTab
                            ledgerId={ledgerId}
                            categories={categories || []}
                            ledger={ledger}
                            periodParams={periodParams}
                            onPeriodChange={handlePeriodChange}
                            onFiltersChange={handleFiltersChange}
                            monthStartDay={monthStartDay}
                        />
                    </TabsContent>

                    <TabsContent value="details" className="mt-0">
                        <DetailsTab
                            ledgerId={ledgerId}
                            categories={categories || []}
                            ledger={ledger}
                            periodParams={periodParams}
                            onPeriodChange={handlePeriodChange}
                            onFiltersChange={handleFiltersChange}
                            advancedFilters={advancedFilters}
                            onAdvancedFiltersChange={handleAdvancedFiltersChange}
                            monthStartDay={monthStartDay}
                        />
                    </TabsContent>

                    <TabsContent value="calendar" className="mt-0">
                        <CalendarTab
                            ledgerId={ledgerId}
                            categories={categories || []}
                            ledger={ledger}
                        />
                    </TabsContent>

                    <TabsContent value="stats" className="mt-0">
                        <StatsTab ledgerId={ledgerId} ledger={ledger} onCategoryDrilldown={handleCategoryDrilldown} />
                    </TabsContent>

                    <TabsContent value="settings" className="mt-0">
                        <SettingsTab
                            ledgerId={ledgerId}
                            ledger={ledger}
                            initialCategories={categories}
                            allLedgers={allLedgers}
                        />
                    </TabsContent>
                </Tabs>
            </main>

            <Dialog open={isInputOpen} onOpenChange={(open) => {
                setIsInputOpen(open);
                if (!open) setInputMode("ai");
            }}>
                <DialogContent className="sm:max-w-md top-[15%] sm:top-[20%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{t("newRecord")}</DialogTitle>
                    </DialogHeader>

                    {/* Mode Toggle */}
                    <div className="flex gap-1 p-1 bg-surface2 rounded-lg">
                        <button
                            onClick={() => setInputMode("ai")}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                inputMode === "ai"
                                    ? "bg-surface text-text shadow-sm"
                                    : "text-muted-foreground hover:text-text"
                            )}
                        >
                            {t("aiParse")}
                        </button>
                        <button
                            onClick={() => setInputMode("quick")}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                inputMode === "quick"
                                    ? "bg-surface text-text shadow-sm"
                                    : "text-muted-foreground hover:text-text"
                            )}
                        >
                            {t("quickEntry")}
                        </button>
                    </div>

                    {inputMode === "ai" ? (
                        <SourceDocumentInput
                            ledgerId={ledgerId}
                            onSuccess={() => setIsInputOpen(false)}
                        />
                    ) : (
                        <QuickEntryForm
                            ledgerId={ledgerId}
                            categories={categories}
                            onSuccess={() => setIsInputOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Task Queue Modal */}
            <TaskQueueModal
                ledgerId={ledgerId}
                open={isPendingOpen}
                onOpenChange={setIsPendingOpen}
            />


            <ModalStackRenderer categories={categories} />
        </div >
    );
}


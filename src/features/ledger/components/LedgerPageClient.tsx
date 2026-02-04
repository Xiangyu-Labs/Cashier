"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
// import { useLedgerEvents } from "@/features/ledger/client/hooks/use-ledger-events";
import { LedgerSwitcher } from "./LedgerSwitcher";
import { useTranslations } from "next-intl";
import { Ledger, EntryCategory } from "@/types/api";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";

interface LedgerPageClientProps {
    initialLedger: Ledger;
    initialCategories: EntryCategory[];
    allLedgers: Ledger[];
    ledgerId: string;
}

export function LedgerPageClient({
    initialLedger: ledger,
    initialCategories: categories,
    allLedgers,
    ledgerId,
}: LedgerPageClientProps) {
    const t = useTranslations("LedgerPage");
    const pathname = usePathname();
    const searchParams = useSearchParams();

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

    // Enable real-time updates not needed here anymore, rely on smart polling in tabs

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
                    <div className="flex items-center gap-3">
                        {/* Pass ledgers to Switcher to avoid internal fetching */}
                        <LedgerSwitcher
                            currentLedgerId={ledgerId}
                            currentLedgerName={ledger.name}
                            ledgers={allLedgers}
                        />
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

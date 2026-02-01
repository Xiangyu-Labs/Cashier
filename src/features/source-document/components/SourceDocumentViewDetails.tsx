"use client";

import { SourceDocument, LedgerEntry } from "@/types/api";
import { type ReactNode, useMemo, useState, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Receipt, Wallet, FileText, Share2, AlignLeft, ImagePlay, Maximize2, Calendar } from "lucide-react";
import { BillEntryItem } from "@/features/ledger/components/BillEntryItem";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";
import { useQueries } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageViewer } from "@/components/ui/image-viewer";
import {
    updateSourceDocumentAction,
    deleteSourceDocumentAction
} from "@/features/source-document/server/actions/main";
import { convertCurrencyAction } from "@/features/ledger/server/actions/currency";

interface CurrencyBreakdownItemProps {
    currency: string;
    amount: number;
    mainCurrency: string;
    date: Date | string;
}

function CurrencyBreakdownItem({ currency, amount, mainCurrency, date }: CurrencyBreakdownItemProps) {
    const { converted } = useConvertedAmount(amount, currency, mainCurrency, typeof date === 'string' ? date : date.toISOString());

    const isMainCurrency = currency === mainCurrency;
    const rate = isMainCurrency ? 1 : (amount > 0 ? converted / amount : 0);

    return (
        <div className="flex items-center gap-3 text-xs text-muted-foreground/80 font-medium whitespace-nowrap">
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-text/90 tabular-nums">{currency}</span>
                <span className="text-text tabular-nums text-[13px] font-bold">{amount.toFixed(2)}</span>
            </div>
            <span className="opacity-30 text-[10px]">×</span>
            <div className="bg-surface2/80 px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono tabular-nums text-primary/70">
                {rate.toFixed(4)}
            </div>
            <span className="opacity-30 text-[10px]">≈</span>
            <div className="font-mono text-primary tabular-nums font-bold">
                {converted.toFixed(2)}
            </div>
        </div>
    );
}

interface SourceDocumentViewDetailsProps {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
    mainCurrency?: string;
    onViewEntry: (entry: LedgerEntry) => void;
}

export const SourceDocumentViewDetails = memo(function SourceDocumentViewDetails({
    sourceDocument,
    ledgerEntries,
    mainCurrency = "CNY",
    onViewEntry,
}: SourceDocumentViewDetailsProps): ReactNode {
    const t = useTranslations("SourceDocumentDetail");
    const tCard = useTranslations("SourceDocumentCard");
    const locale = useLocale();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    const { subtotalsByCurrency } = useMemo(() => {
        const groups: Record<string, number> = {};
        ledgerEntries.forEach(entry => {
            const curr = entry.currency || mainCurrency;
            groups[curr] = (groups[curr] || 0) + parseFloat(entry.amount);
        });

        return {
            subtotalsByCurrency: groups,
        };
    }, [ledgerEntries, mainCurrency]);

    const uniqueCurrencies = Object.keys(subtotalsByCurrency);

    // Use useQueries to get all conversions for total calculation
    const conversionQueries = useQueries({
        queries: uniqueCurrencies.map(currency => {
            const amount = subtotalsByCurrency[currency];
            const date = ledgerEntries.find(e => e.currency === currency)?.entryDate || sourceDocument.createdAt;
            const dateStr = typeof date === 'string' ? date : (date as any).toISOString();

            return {
                queryKey: ["convert", amount, currency, mainCurrency, dateStr],
                queryFn: async () => {
                    if (currency === mainCurrency) return { converted: amount };
                    const result = await convertCurrencyAction(amount, currency, mainCurrency, dateStr);
                    if (!result.success) throw new Error(result.error || "Conversion failed");
                    return { converted: result.converted! };
                },
                staleTime: 1000 * 60 * 60 * 24,
            };
        })
    });

    const totalInMainCurrency = useMemo(() => {
        return conversionQueries.reduce((sum, query) => {
            return sum + (query.data?.converted ?? 0);
        }, 0);
    }, [conversionQueries]);

    const isLoadingConverted = conversionQueries.some(q => q.isLoading);

    const sortedEntries = useMemo(() => {
        return [...ledgerEntries].sort((a, b) => {
            const aOrder = a.category?.sortOrder ?? 999999;
            const bOrder = b.category?.sortOrder ?? 999999;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return parseFloat(b.amount) - parseFloat(a.amount);
        });
    }, [ledgerEntries]);

    // Derived Status Info
    const isAnomaly = sourceDocument.status === "anomaly";

    return (
        <div className="h-full flex flex-col max-w-5xl mx-auto lg:h-[calc(100vh-140px)]">
            {/* Integrated Workspace - Now full width for better focus */}
            <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                <Tabs defaultValue="entries" className="h-full flex flex-col gap-3 lg:gap-4">
                    <div className="shrink-0 flex items-center justify-between gap-3 px-1 sm:px-0">
                        {/* Header: Focused metadata for mobile */}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground font-medium">
                                <Calendar className="h-3 w-3 text-primary/60" />
                                {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                })}
                                {isAnomaly && (
                                    <Badge variant="error" className="h-3.5 px-1 text-[8px] md:text-[9px] uppercase font-black tracking-tighter rounded-full">
                                        Anomaly
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <TabsList className="bg-surface2/50 p-1 border border-border/40 rounded-xl h-9 md:h-10">
                            <TabsTrigger value="entries" className="rounded-lg px-3 md:px-4 text-[10px] md:text-xs font-bold uppercase tracking-wider">{t("entries")}</TabsTrigger>
                            <TabsTrigger value="raw" className="rounded-lg px-3 md:px-4 text-[10px] md:text-xs font-bold uppercase tracking-wider">{t("rawEvidence")}</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="entries" className="flex-1 min-h-0 m-0 p-0 flex flex-col gap-3 md:gap-4 focus-visible:outline-none">
                        {/* Financial Summary: Compact for mobile, spacious for desktop */}
                        <div className="rounded-xl md:rounded-2xl border border-border/80 bg-surface shadow-sm p-4 md:p-5 space-y-3 md:space-y-4">
                            <div className="flex flex-col gap-0.5 md:gap-1">
                                <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
                                    <Wallet className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                    {t("totalAmount")}
                                </div>
                                <div className="flex items-baseline gap-1.5 md:gap-2">
                                    <span className="text-3xl md:text-4xl font-black text-primary tabular-nums tracking-tighter">
                                        {isLoadingConverted ? (
                                            <span className="animate-pulse opacity-50">...</span>
                                        ) : (
                                            totalInMainCurrency.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        )}
                                    </span>
                                    <span className="text-lg md:text-xl font-black text-primary/40 leading-none">{mainCurrency}</span>
                                </div>
                            </div>

                            {uniqueCurrencies.length > 0 && (
                                <div className="pt-3 md:pt-4 border-t border-border/40 flex flex-col gap-2 md:gap-2.5">
                                    {uniqueCurrencies.map(curr => (
                                        <CurrencyBreakdownItem
                                            key={curr}
                                            currency={curr}
                                            amount={subtotalsByCurrency[curr]}
                                            mainCurrency={mainCurrency}
                                            date={ledgerEntries.find(e => e.currency === curr)?.entryDate || sourceDocument.createdAt}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Entries List: Optimized for touch */}
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-4 scrollbar-none">
                                {sortedEntries.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-border/80 rounded-2xl bg-surface2/5">
                                        <p className="text-muted-foreground text-sm font-medium">{t("noEntries")}</p>
                                    </div>
                                ) : (
                                    sortedEntries.map((entry) => (
                                        <BillEntryItem
                                            key={entry.id}
                                            ledgerEntry={entry}
                                            onView={() => onViewEntry(entry)}
                                            mainCurrency={mainCurrency}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="raw" className="flex-1 min-h-0 m-0 p-0 overflow-y-auto focus-visible:outline-none scrollbar-none">
                        <div className="space-y-6 pb-20 sm:pb-10">
                            {/* 1. Visual Evidence: Compact Grid of Images */}
                            {sourceDocument.imageUrls.length > 0 && (
                                <div className="bg-surface2/30 p-4 md:p-6 rounded-2xl border border-border/60">
                                    <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <ImagePlay className="h-3 w-3 text-primary" />
                                        {tCard("image") || "Images"}
                                    </h5>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                                        {sourceDocument.imageUrls.map((url, idx) => (
                                            <div
                                                key={idx}
                                                className="aspect-square relative rounded-xl overflow-hidden border border-border/60 bg-surface/50 cursor-pointer group transition-all hover:ring-2 hover:ring-primary/20 hover:border-primary/30"
                                                onClick={() => setViewerIndex(idx)}
                                            >
                                                <img
                                                    src={url}
                                                    alt={tCard("imageAlt", { index: idx + 1 })}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="bg-black/40 text-white h-7 w-7 rounded-full flex items-center justify-center backdrop-blur-md translate-y-2 group-hover:translate-y-0 transition-all">
                                                        <Maximize2 className="h-3.5 w-3.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 2. Textual Evidence: Clean RAW View */}
                            <div className="bg-surface2/30 p-4 md:p-6 rounded-2xl border border-border/60">
                                <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-primary" />
                                    {t("rawContent")}
                                </h5>

                                <div className="space-y-2">
                                    <div className="text-[11px] md:text-xs text-text/80 font-mono leading-relaxed whitespace-pre-wrap bg-surface/50 p-4 rounded-xl border border-border/40">
                                        {sourceDocument.text || "No raw text available."}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Shared Gallery Viewer */}
                        <ImageViewer
                            images={sourceDocument.imageUrls}
                            initialIndex={viewerIndex ?? 0}
                            open={viewerIndex !== null}
                            onOpenChange={(open: boolean) => !open && setViewerIndex(null)}
                        />
                    </TabsContent>

                </Tabs>
            </div>
        </div>
    );
})


"use client";

import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";
import Image from "next/image";
import { type ReactNode, useMemo, useState, memo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Wallet, FileText, ImagePlay, Maximize2, Calendar } from "lucide-react";
import { EditableBillEntryItem, EntryEditData } from "@/features/ledger/components/EditableBillEntryItem";
import { EditableField } from "@/components/ui/editable-field";
import { DateFilter } from "@/components/ui/date-filter";
import { useConvertedAmount } from "@/features/currency/client/hooks/useConvertedAmount";
import { useQueries } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageViewer } from "@/components/ui/image-viewer";
import { convertCurrencyAction } from "@/features/currency/server/actions";

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

// Types for pending changes
export interface SourceDocPendingChanges {
    title?: string;
    entryDate?: string;
}

export interface EntriesPendingChanges {
    [entryId: string]: Partial<EntryEditData>;
}

export interface PendingChanges {
    sourceDoc: SourceDocPendingChanges;
    entries: EntriesPendingChanges;
}

interface SourceDocumentViewDetailsProps {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
    categories: EntryCategory[];
    preferredCurrencies?: string[];
    mainCurrency?: string;
    pendingChanges: PendingChanges;
    selectedEntryIds: string[];
    onSourceDocChange: (changes: SourceDocPendingChanges) => void;
    onEntryChange: (entryId: string, changes: Partial<EntryEditData>) => void;
    onSelectEntry: (entryId: string, selected: boolean) => void;
    onSelectAllEntries: (selected: boolean) => void;
}

export const SourceDocumentViewDetails = memo(function SourceDocumentViewDetails({
    sourceDocument,
    ledgerEntries,
    categories,
    preferredCurrencies = [],
    mainCurrency = "CNY",
    pendingChanges,
    selectedEntryIds,
    onSourceDocChange,
    onEntryChange,
    onSelectEntry,
    onSelectAllEntries,
}: SourceDocumentViewDetailsProps): ReactNode {
    const t = useTranslations("SourceDocumentDetail");
    const tCard = useTranslations("SourceDocumentCard");
    const locale = useLocale();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    // Merge pending changes with original data
    const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument.title ?? "";
    const displayEntryDate = pendingChanges.sourceDoc.entryDate ?? sourceDocument.entryDate ?? "";

    const { subtotalsByCurrency } = useMemo(() => {
        const groups: Record<string, number> = {};
        ledgerEntries.forEach(entry => {
            const pendingCurrency = pendingChanges.entries[entry.id]?.currency;
            const pendingAmount = pendingChanges.entries[entry.id]?.amount;
            const curr = pendingCurrency ?? entry.currency ?? mainCurrency;
            const amt = pendingAmount ?? entry.amount;
            groups[curr] = (groups[curr] || 0) + parseFloat(amt);
        });

        return {
            subtotalsByCurrency: groups,
        };
    }, [ledgerEntries, mainCurrency, pendingChanges.entries]);

    const uniqueCurrencies = Object.keys(subtotalsByCurrency);

    const conversionQueries = useQueries({
        queries: uniqueCurrencies.map(currency => {
            const amount = subtotalsByCurrency[currency];
            const date = sourceDocument.entryDate || sourceDocument.createdAt;

            return {
                queryKey: ["convert", amount, currency, mainCurrency, date],
                queryFn: async () => {
                    if (currency === mainCurrency) return { converted: amount };
                    const result = await convertCurrencyAction(amount, currency, mainCurrency, date);
                    return { converted: result.converted };
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

    const isAnomaly = sourceDocument.status === "anomaly";
    const allSelected = selectedEntryIds.length === ledgerEntries.length && ledgerEntries.length > 0;

    return (
        <div className="h-full flex flex-col mx-auto lg:h-[calc(100vh-140px)]">
            <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                <Tabs defaultValue="entries" className="h-full flex flex-col gap-2">
                    <div className="shrink-0 flex items-center justify-between gap-2">
                        {/* Header with editable date */}
                        <div className="min-w-0 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-[120px]">
                                <DateFilter
                                    value={displayEntryDate}
                                    onChange={(date: Date | null) => {
                                        if (date) {
                                            const y = date.getFullYear();
                                            const m = String(date.getMonth() + 1).padStart(2, "0");
                                            const d = String(date.getDate()).padStart(2, "0");
                                            onSourceDocChange({ entryDate: `${y}-${m}-${d}` });
                                        }
                                    }}
                                    size="sm"
                                />
                            </div>
                            <span className="text-muted-foreground/40">|</span>
                            <span className="text-muted-foreground/60 text-[10px] md:text-xs">
                                {t("createdAt")}: {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                            {isAnomaly && (
                                <Badge variant="error" className="h-3.5 px-1 text-[8px] md:text-[9px] uppercase font-black tracking-tighter rounded-full">
                                    Anomaly
                                </Badge>
                            )}
                        </div>
                        <TabsList className="bg-surface2/50 p-1 border border-border/40 rounded-xl h-9 md:h-10">
                            <TabsTrigger value="entries" className="rounded-lg px-3 md:px-4 text-[10px] md:text-xs font-bold uppercase tracking-wider">{t("entries")}</TabsTrigger>
                            <TabsTrigger value="raw" className="rounded-lg px-3 md:px-4 text-[10px] md:text-xs font-bold uppercase tracking-wider">{t("rawEvidence")}</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="entries" className="flex-1 min-h-0 m-0 p-0 flex flex-col gap-2 focus-visible:outline-none">
                        {/* Financial Summary */}
                        <div className="rounded-lg border border-border/80 bg-surface shadow-sm p-3 space-y-2">
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em] opacity-60">
                                    <Wallet className="h-2.5 w-2.5" />
                                    {t("totalAmount")}
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-primary tabular-nums tracking-tight">
                                        {isLoadingConverted ? (
                                            <span className="animate-pulse opacity-50">...</span>
                                        ) : (
                                            totalInMainCurrency.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        )}
                                    </span>
                                    <span className="text-base font-bold text-primary/40 leading-none">{mainCurrency}</span>
                                </div>
                            </div>

                            {uniqueCurrencies.length > 0 && (
                                <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5">
                                    {uniqueCurrencies.map(curr => (
                                        <CurrencyBreakdownItem
                                            key={curr}
                                            currency={curr}
                                            amount={subtotalsByCurrency[curr]}
                                            mainCurrency={mainCurrency}
                                            date={sourceDocument.entryDate || sourceDocument.createdAt}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Entries List */}
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 pb-2 scrollbar-none">
                                {sortedEntries.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-border/80 rounded-2xl bg-surface2/5">
                                        <p className="text-muted-foreground text-sm font-medium">{t("noEntries")}</p>
                                    </div>
                                ) : (
                                    sortedEntries.map((entry) => (
                                        <EditableBillEntryItem
                                            key={entry.id}
                                            ledgerEntry={entry}
                                            categories={categories}
                                            preferredCurrencies={preferredCurrencies}
                                            mainCurrency={mainCurrency}
                                            selected={selectedEntryIds.includes(entry.id)}
                                            onSelect={(selected) => onSelectEntry(entry.id, selected)}
                                            onChange={(changes) => onEntryChange(entry.id, changes)}
                                            pendingChanges={pendingChanges.entries[entry.id]}
                                            sourceDocumentEntryDate={displayEntryDate}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="raw" className="flex-1 min-h-0 m-0 p-0 overflow-y-auto focus-visible:outline-none scrollbar-none">
                        <div className="space-y-6 pb-20 sm:pb-10">
                            {(sourceDocument.imageUrls?.length ?? 0) > 0 && (
                                <div className="bg-surface2/30 p-4 md:p-6 rounded-2xl border border-border/60">
                                    <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <ImagePlay className="h-3 w-3 text-primary" />
                                        {tCard("image") || "Images"}
                                    </h5>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                                        {(sourceDocument.imageUrls || []).map((url, idx) => (
                                            <div
                                                key={idx}
                                                className="aspect-square relative rounded-xl overflow-hidden border border-border/60 bg-surface/50 cursor-pointer group transition-all hover:ring-2 hover:ring-primary/20 hover:border-primary/30"
                                                onClick={() => setViewerIndex(idx)}
                                            >
                                                <Image
                                                    src={url}
                                                    alt={tCard("imageAlt", { index: idx + 1 })}
                                                    fill
                                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
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

                        <ImageViewer
                            images={sourceDocument.imageUrls || []}
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

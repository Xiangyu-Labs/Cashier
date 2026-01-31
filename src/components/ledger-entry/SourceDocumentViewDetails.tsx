"use client";

import { SourceDocument, LedgerEntry } from "@/types/api";
import { type ReactNode, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { FileText, Calendar, Wallet, ListChecks, ArrowLeft, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { SourceDocumentOriginalContent } from "./SourceDocumentOriginalContent";
import { BillEntryItem } from "./BillEntryItem";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";
import { useQueries } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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
        <div className="grid grid-cols-[auto_24px_64px_auto_1fr] items-center gap-1 text-xs text-muted-foreground mt-1.5 leading-none">
            <div className="font-medium text-text/80 tabular-nums min-w-[60px]">
                {currency} {amount.toFixed(2)}
            </div>
            <span className="opacity-40 text-center text-[10px]">×</span>
            <div className="bg-surface2/50 px-1.5 py-0.5 rounded-[4px] text-[10px] text-center font-mono tabular-nums">
                {rate.toFixed(4)}
            </div>
            <span className="opacity-40 ml-2 whitespace-nowrap">≈ {mainCurrency}</span>
            <div className="font-mono text-primary/70 text-right tabular-nums font-medium">
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

export function SourceDocumentViewDetails({
    sourceDocument,
    ledgerEntries,
    mainCurrency = "CNY",
    onViewEntry,
}: SourceDocumentViewDetailsProps): ReactNode {
    const t = useTranslations("SourceDocumentDetail");
    const tCard = useTranslations("SourceDocumentCard");
    const locale = useLocale();

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
                    const searchParams = new URLSearchParams();
                    searchParams.set("amount", amount.toString());
                    searchParams.set("from", currency);
                    searchParams.set("to", mainCurrency);
                    searchParams.set("date", dateStr);

                    const res = await fetch(`/api/currency/convert?${searchParams}`);
                    if (!res.ok) throw new Error("Conversion failed");
                    return res.json();
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
    const statusColor = isAnomaly ? "destructive" : "primary";
    const StatusIcon = isAnomaly ? AlertTriangle : ShieldCheck;

    return (
        <div className="h-full flex flex-col lg:flex-row lg:h-[calc(100vh-140px)] gap-6">
            {/* LEFT COLUMN: Visual Evidence / Original Content */}
            <div className="flex-1 lg:flex-[0.4] min-h-[300px] lg:min-h-0 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {tCard("viewContent")}
                    </h4>
                </div>

                <div className="flex-1 rounded-xl border border-border bg-surface overflow-hidden relative shadow-sm">
                    <SourceDocumentOriginalContent
                        text={sourceDocument.text}
                        images={sourceDocument.imageUrls}
                        className="h-full overflow-y-auto p-4"
                    />
                </div>
            </div>

            {/* RIGHT COLUMN: Data Extraction Workstation */}
            <div className="flex-1 lg:flex-[0.6] min-w-0 flex flex-col h-full overflow-hidden">
                <div className="flex flex-col h-full gap-4">

                    {/* Header / Meta / Status */}
                    <div className="shrink-0 space-y-4">
                        {/* Title & Date */}
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-2xl font-semibold text-text truncate tracking-tight">
                                    {sourceDocument.title || t("titlePlaceholder")}
                                </h3>
                                <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="h-4 w-4 opacity-70" />
                                        {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short'
                                        })}
                                    </div>
                                    {isAnomaly && (
                                        <Badge variant="error" className="h-5 px-1.5 text-[10px] uppercase font-bold tracking-wide">
                                            Anomaly
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Financial Summary Card */}
                        <div className="rounded-xl border border-border bg-surface2/30 p-4 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        <Wallet className="h-3.5 w-3.5" />
                                        {t("totalAmount")}
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-sm font-normal text-muted-foreground">{mainCurrency}</span>
                                        <span className="text-3xl font-bold text-primary tabular-nums tracking-tight">
                                            {isLoadingConverted ? (
                                                <span className="animate-pulse opacity-50">...</span>
                                            ) : (
                                                totalInMainCurrency.toFixed(2)
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1 max-w-xs space-y-1">
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
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Entries List */}
                    <div className="flex-1 min-h-0 flex flex-col pt-2">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <ListChecks className="w-4 h-4" />
                                {t("entries")}
                                <span className="bg-surface2 text-xs py-0.5 px-2 rounded-full font-mono text-text/70 border border-border/50">
                                    {ledgerEntries.length}
                                </span>
                            </h4>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-2 pb-4">
                            {sortedEntries.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border/60 rounded-xl bg-surface2/10">
                                    <p className="text-muted-foreground text-sm">{t("noEntries")}</p>
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

                </div>
            </div>
        </div>
    );
}

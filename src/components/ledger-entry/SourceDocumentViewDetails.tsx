"use client";

import { SourceDocument, LedgerEntry } from "@/types/api";
import { type ReactNode, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { FileText, Calendar, Wallet, ListChecks } from "lucide-react";
import { ProcessingStatus } from "@/components/ui/ProcessingStatus";
import { SourceDocumentOriginalContent } from "./SourceDocumentOriginalContent";
import { BillEntryItem } from "./BillEntryItem";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";
import { useQueries } from "@tanstack/react-query";

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
            <div className="font-medium text-text/80 tabular-nums min-w-[80px]">
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

    const status = sourceDocument.status || "completed";

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20 shrink-0">
                    <FileText className="h-8 w-8" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-text truncate">
                        {sourceDocument.title || t("titlePlaceholder")}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(sourceDocument.createdAt).toLocaleString(locale)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-surface2/30 p-4 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Wallet className="h-3 w-3" />
                        {t("totalAmount")}
                    </div>

                    <div className="space-y-2">
                        {uniqueCurrencies.map(curr => (
                            <CurrencyBreakdownItem
                                key={curr}
                                currency={curr}
                                amount={subtotalsByCurrency[curr]}
                                mainCurrency={mainCurrency}
                                date={ledgerEntries.find(e => e.currency === curr)?.entryDate || sourceDocument.createdAt}
                            />
                        ))}

                        {/* Final Total in Main Currency */}
                        <div className="pt-2 mt-2 border-t border-border/50 flex items-baseline justify-between gap-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("totalAmount")}</div>
                            <span className="text-2xl font-bold text-primary">
                                <span className="text-sm font-normal text-muted-foreground mr-1">{mainCurrency}</span>
                                {isLoadingConverted ? (
                                    <span className="animate-pulse opacity-50">...</span>
                                ) : (
                                    totalInMainCurrency.toFixed(2)
                                )}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-surface2/30 p-4 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <ListChecks className="h-3 w-3" />
                        {t("entries")}
                    </div>
                    <div className="text-2xl font-bold text-text">
                        {ledgerEntries.length}
                        <span className="text-sm font-normal text-muted-foreground ml-1">{tCard("records", { count: ledgerEntries.length }).split(' ')[1]}</span>
                    </div>
                </div>
            </div>

            {/* Original Content Section */}
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <div className="w-1 h-3 bg-primary rounded-full" />
                    {tCard("viewContent")}
                </h4>
                <div className="p-4 rounded-xl border border-border bg-surface flex flex-col gap-4">
                    <SourceDocumentOriginalContent
                        text={sourceDocument.text}
                        images={sourceDocument.imageUrls}
                    />
                </div>
            </div>

            {/* Entries List Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <div className="w-1 h-3 bg-primary rounded-full" />
                        {t("entries")}
                    </h4>
                </div>
                <div className="space-y-2">
                    {sortedEntries.length === 0 ? (
                        <div className="text-center py-8 bg-surface2/30 rounded-xl border border-dashed border-border text-muted-foreground text-sm">
                            {t("noEntries")}
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
    );
}

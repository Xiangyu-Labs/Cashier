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

    const { totalAmount, hasMultipleCurrencies } = useMemo(() => {
        const total = ledgerEntries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);

        // Use the first entry's currency and date for the primary conversion comparison
        // In a real scenario, we might want to convert each entry individually, 
        // but for a summary view, this is often sufficient if they share a document.
        const firstEntry = ledgerEntries[0];
        return {
            totalAmount: total,
            hasMultipleCurrencies: new Set(ledgerEntries.map(e => e.currency)).size > 1
        };
    }, [ledgerEntries]);

    const { converted } = useConvertedAmount(
        totalAmount,
        ledgerEntries[0]?.currency || mainCurrency,
        mainCurrency,
        ledgerEntries[0]?.entryDate || sourceDocument.createdAt
    );

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
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-primary">
                            <span className="text-sm font-normal text-muted-foreground mr-1">{mainCurrency}</span>
                            {converted.toFixed(2)}
                        </span>
                        {ledgerEntries[0]?.currency && ledgerEntries[0].currency !== mainCurrency && !hasMultipleCurrencies && (
                            <span className="text-sm text-muted-foreground">
                                ≈ {ledgerEntries[0].currency} {totalAmount.toFixed(2)}
                            </span>
                        )}
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

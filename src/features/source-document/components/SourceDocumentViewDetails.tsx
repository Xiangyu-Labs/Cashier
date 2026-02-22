"use client";

import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";
import Image from "next/image";
import { type ReactNode, useMemo, useState, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, FileText, ImagePlay, Maximize2, ChevronDown, ChevronRight, CheckSquare, X } from "lucide-react";
import { EditableBillEntryItem, EntryEditData } from "@/features/ledger/components/EditableBillEntryItem";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ImageViewer } from "@/components/ui/image-viewer";
import { cn } from "@/lib/utils";

interface CurrencyBreakdownItemProps {
    currency: string;
    amount: number;
    mainCurrency: string;
    entries: LedgerEntry[];
}

function CurrencyBreakdownItem({ currency, amount, mainCurrency, entries }: CurrencyBreakdownItemProps) {
    // Calculate converted amount and average rate from entries
    const { converted, rate: _rate } = useMemo(() => {
        const currencyEntries = entries.filter(e => (e.currency || mainCurrency) === currency);

        let totalConverted = 0;
        currencyEntries.forEach(entry => {
            if (entry.convertedAmount) {
                totalConverted += parseFloat(entry.convertedAmount);
            } else if ((entry.currency || mainCurrency) === mainCurrency) {
                totalConverted += parseFloat(entry.amount);
            }
        });

        const avgRate = amount > 0 ? totalConverted / amount : 1;

        return { converted: totalConverted, rate: avgRate };
    }, [entries, currency, mainCurrency, amount]);

    return (
        <span className="text-xs text-muted-foreground/80">
            <span className="font-mono tabular-nums">{currency} {amount.toFixed(2)}</span>
            {currency !== mainCurrency && (
                <span className="ml-1.5 text-[10px]">
                    (≈ {mainCurrency} {converted.toFixed(2)})
                </span>
            )}
        </span>
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
    isSelectionMode: boolean;
    onSourceDocChange: (changes: SourceDocPendingChanges) => void;
    onEntryChange: (entryId: string, changes: Partial<EntryEditData>) => void;
    onSelectEntry: (entryId: string, selected: boolean) => void;
    onSelectAllEntries: (selected: boolean) => void;
    onToggleSelectionMode: () => void;
}

export const SourceDocumentViewDetails = memo(function SourceDocumentViewDetails({
    sourceDocument,
    ledgerEntries,
    categories,
    preferredCurrencies = [],
    mainCurrency = "CNY",
    pendingChanges,
    selectedEntryIds,
    isSelectionMode,
    onSourceDocChange,
    onEntryChange,
    onSelectEntry,
    onSelectAllEntries,
    onToggleSelectionMode,
}: SourceDocumentViewDetailsProps): ReactNode {
    const t = useTranslations("SourceDocumentDetail");
    const tCard = useTranslations("SourceDocumentCard");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [isRawExpanded, setIsRawExpanded] = useState(false);

    // Merge pending changes with original data
    const displayEntryDate = pendingChanges.sourceDoc.entryDate ?? sourceDocument.entryDate ?? "";

    const { subtotalsByCurrency, totalInMainCurrency } = useMemo(() => {
        const groups: Record<string, number> = {};
        let mainCurrencyTotal = 0;

        ledgerEntries.forEach(entry => {
            const pendingCurrency = pendingChanges.entries[entry.id]?.currency;
            const pendingAmount = pendingChanges.entries[entry.id]?.amount;
            const curr = pendingCurrency ?? entry.currency ?? mainCurrency;
            const amt = pendingAmount ?? entry.amount;
            groups[curr] = (groups[curr] || 0) + parseFloat(amt);

            // Use convertedAmount if available, otherwise use amount (for main currency)
            if (entry.convertedAmount) {
                mainCurrencyTotal += parseFloat(entry.convertedAmount);
            } else if (curr === mainCurrency) {
                mainCurrencyTotal += parseFloat(amt);
            }
        });

        return {
            subtotalsByCurrency: groups,
            totalInMainCurrency: mainCurrencyTotal
        };
    }, [ledgerEntries, mainCurrency, pendingChanges.entries]);

    const uniqueCurrencies = Object.keys(subtotalsByCurrency);

    const sortedEntries = useMemo(() => {
        return [...ledgerEntries].sort((a, b) => {
            const aOrder = a.category?.sortOrder ?? 999999;
            const bOrder = b.category?.sortOrder ?? 999999;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return parseFloat(b.amount) - parseFloat(a.amount);
        });
    }, [ledgerEntries]);

    const isAnomaly = sourceDocument.status === "anomaly";
    const hasImages = (sourceDocument.imageUrls?.length ?? 0) > 0;
    const hasRawText = sourceDocument.text && sourceDocument.text.trim().length > 0;

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Header Section */}
            <div className="shrink-0 space-y-2">
                {/* Date row */}
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">
                            {t("transactionTime")}:
                        </span>
                        <Input
                            type="date"
                            value={displayEntryDate}
                            onChange={(e) => {
                                if (e.target.value) {
                                    onSourceDocChange({ entryDate: e.target.value });
                                }
                            }}
                            className="h-8 text-sm w-[160px] shrink-0"
                            autoComplete="off"
                        />
                        {isAnomaly && (
                            <Badge variant="error" className="h-4 px-1.5 text-[8px] uppercase font-black tracking-tighter rounded-full">
                                {tCommon("error")}
                            </Badge>
                        )}
                        <span className="text-muted-foreground/30 hidden sm:inline">|</span>
                        <span className="text-muted-foreground/50 text-[10px] hidden sm:inline">
                            {t("createdAt")}: {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    </div>
                </div>

                {/* Financial Summary - simplified one-line display */}
                <div className="flex items-center gap-2 text-sm py-1">
                    <Wallet className="h-3.5 w-3.5 text-primary/60" />
                    <span className="text-muted-foreground/60 text-xs font-medium uppercase tracking-wider">
                        {t("totalAmount")}:
                    </span>
                    <span className="font-bold text-primary tabular-nums">
                        {totalInMainCurrency.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-muted-foreground/50 text-xs">{mainCurrency}</span>
                    {uniqueCurrencies.length > 1 && (
                        <div className="flex items-center gap-1.5 ml-1">
                            <span className="text-muted-foreground/30">·</span>
                            {uniqueCurrencies.map(curr => (
                                <CurrencyBreakdownItem
                                    key={curr}
                                    currency={curr}
                                    amount={subtotalsByCurrency[curr]}
                                    mainCurrency={mainCurrency}
                                    entries={ledgerEntries}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Entries Section */}
            <div className="flex-1 min-h-0 flex flex-col">
                {/* Section Header with Select button */}
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Select/Cancel button - leftmost position */}
                        {sortedEntries.length > 0 && (
                            <Button
                                variant={isSelectionMode ? "secondary" : "ghost"}
                                size="icon"
                                onClick={onToggleSelectionMode}
                                className="shrink-0 h-8 w-8"
                                title={isSelectionMode ? t("cancelSelect") : t("select")}
                            >
                                {isSelectionMode ? (
                                    <X className="w-4 h-4" />
                                ) : (
                                    <CheckSquare className="w-4 h-4" />
                                )}
                            </Button>
                        )}
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">
                            {t("entries")} ({ledgerEntries.length})
                        </span>
                    </div>
                </div>

                {/* Entries List */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-2 scrollbar-none">
                    {sortedEntries.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-border/80 rounded-2xl bg-surface2/5">
                            <p className="text-muted-foreground text-sm font-medium">{t("noEntries")}</p>
                        </div>
                    ) : (
                        sortedEntries.map((entry) => (
                            <Card
                                key={entry.id}
                                className={cn(
                                    "overflow-hidden",
                                    selectedEntryIds.includes(entry.id) && isSelectionMode && "border-primary bg-primary/5"
                                )}
                            >
                                <EditableBillEntryItem
                                    ledgerEntry={entry}
                                    categories={categories}
                                    categoryPlaceholder={t("selectCategory")}
                                    preferredCurrencies={preferredCurrencies}
                                    mainCurrency={mainCurrency}
                                    selected={selectedEntryIds.includes(entry.id)}
                                    onSelect={isSelectionMode ? (selected) => onSelectEntry(entry.id, selected) : undefined}
                                    onChange={(changes) => onEntryChange(entry.id, changes)}
                                    pendingChanges={pendingChanges.entries[entry.id]}
                                    sourceDocumentEntryDate={displayEntryDate}
                                />
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Raw Evidence Section - Collapsible */}
            {(hasImages || hasRawText) && (
                <div className="shrink-0 border border-border/60 rounded-xl bg-surface2/20 overflow-hidden">
                    <button
                        onClick={() => setIsRawExpanded(!isRawExpanded)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface2/40 transition-colors"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">
                            <FileText className="h-3 w-3 text-primary/70" />
                            {t("rawEvidence")}
                            {(hasImages || hasRawText) && (
                                <span className="text-muted-foreground/40 font-normal lowercase">
                                    ({[
                                        hasImages && `${sourceDocument.imageUrls?.length} ${tCard("image")}`,
                                        hasRawText && t("rawContent")
                                    ].filter(Boolean).join(", ")})
                                </span>
                            )}
                        </div>
                        {isRawExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        )}
                    </button>

                    {isRawExpanded && (
                        <div className="px-3 pb-3 space-y-4 border-t border-border/40 pt-3">
                            {/* Images */}
                            {hasImages && (
                                <div>
                                    <h5 className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                                        <ImagePlay className="h-2.5 w-2.5 text-primary/60" />
                                        {tCard("image")}
                                    </h5>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                        {(sourceDocument.imageUrls || []).map((url, idx) => (
                                            <div
                                                key={idx}
                                                className="aspect-square relative rounded-lg overflow-hidden border border-border/50 bg-surface/50 cursor-pointer group transition-all hover:ring-2 hover:ring-primary/20 hover:border-primary/30"
                                                onClick={() => setViewerIndex(idx)}
                                            >
                                                <Image
                                                    src={url}
                                                    alt={tCard("imageAlt", { index: idx + 1 })}
                                                    fill
                                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="bg-black/40 text-white h-6 w-6 rounded-full flex items-center justify-center backdrop-blur-md">
                                                        <Maximize2 className="h-3 w-3" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Raw Text */}
                            {hasRawText && (
                                <div>
                                    <h5 className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] mb-2">
                                        {t("rawContent")}
                                    </h5>
                                    <div className="text-[11px] text-text/70 font-mono leading-relaxed whitespace-pre-wrap bg-surface/50 p-3 rounded-lg border border-border/40 max-h-40 overflow-y-auto">
                                        {sourceDocument.text}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Image Viewer */}
            <ImageViewer
                images={sourceDocument.imageUrls || []}
                initialIndex={viewerIndex ?? 0}
                open={viewerIndex !== null}
                onOpenChange={(open: boolean) => !open && setViewerIndex(null)}
            />
        </div>
    );
})

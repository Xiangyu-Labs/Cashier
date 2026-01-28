"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLedgerEntry, deleteLedgerEntry } from "@/lib/api";
import { LedgerEntry, EntryCategory, SourceDocument } from "@/types/api";
import { BatchLedgerEntryCard } from "@/components/ledger-entry/BatchLedgerEntryCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { LedgerEntryDetailModal } from "@/components/LedgerEntryDetailModal";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";

interface HistoryTabProps {
    ledgerId: string;
    confirmedGroups: {
        batches: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }[];
        others: LedgerEntry[];
    };
    categories: EntryCategory[];
}

export function HistoryTab({ ledgerId, confirmedGroups, categories }: HistoryTabProps) {
    const t = useTranslations("HistoryTab");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const queryClient = useQueryClient();
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const updateMutation = useMutation({
        mutationFn: ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Parameters<typeof updateLedgerEntry>[2] }) =>
            updateLedgerEntry(ledgerId, ledgerEntryId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (ledgerEntryId: string) => deleteLedgerEntry(ledgerId, ledgerEntryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const hasHistory = confirmedGroups.batches.length > 0 || confirmedGroups.others.length > 0;

    if (!hasHistory) {
        return (
            <div className="py-16 text-center text-muted">
                {t("noHistory")}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {confirmedGroups.batches.map((batch) => (
                <BatchLedgerEntryCard
                    key={batch.sourceDocument.id}
                    sourceDocument={batch.sourceDocument}
                    ledgerEntries={batch.ledgerEntries}
                    categories={categories}
                    isConfirmed={true}
                    onUpdateLedgerEntry={(id, data) =>
                        updateMutation.mutate({ ledgerEntryId: id, data })
                    }
                    onDeleteLedgerEntry={(id) => deleteMutation.mutate(id)}
                    status="completed"
                />
            ))}

            {confirmedGroups.others.length > 0 && (
                <Card>
                    <div className="bg-surface2 p-3 border-b border-border">
                        <h3 className="font-medium text-text">{t("otherHistory")}</h3>
                    </div>
                    <CardContent className="p-4 space-y-2">
                        {confirmedGroups.others.map((entry) => (
                            <div
                                key={entry.id}
                                onClick={() => {
                                    setSelectedLedgerEntry(entry);
                                    setIsDetailModalOpen(true);
                                }}
                                className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-surface2 rounded px-2 -mx-2 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="text-xl w-8 h-8 flex items-center justify-center bg-surface2 rounded-full">
                                        <CategoryIcon iconName={entry.category?.icon} className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-text">{entry.itemName}</p>
                                        <p className="text-xs text-muted">
                                            {entry.category?.name || tCommon("unclassified")}
                                            {entry.transactionDate && (
                                                <span className="ml-2">
                                                    · {new Date(entry.transactionDate).toLocaleDateString(locale)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <p className={`font-semibold ${entry.amount.startsWith("-") ? 'text-text' : 'text-danger'}`}>
                                    {entry.currency || ""} {parseFloat(entry.amount).toFixed(2)}
                                </p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <LedgerEntryDetailModal
                ledgerEntry={selectedLedgerEntry}
                categories={categories}
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/routing";
import { fetchLedgerEntrySummary } from "@/lib/api";
import { Ledger } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

interface LedgerItemProps {
    ledger: Ledger;
    onEdit: (ledger: Ledger) => void;
    onDelete: (ledger: Ledger) => void;
}

export function LedgerItem({ ledger, onEdit, onDelete }: LedgerItemProps) {
    const t = useTranslations("LedgerItem");
    const router = useRouter();

    const { data: summary } = useQuery({
        queryKey: ["summary", ledger.id],
        queryFn: () => fetchLedgerEntrySummary(ledger.id),
    });

    const stats = useMemo(() => {
        if (!summary) return { total: 0, count: 0, currency: "CNY" };
        const mainTotal = summary.totals[0] || { total: 0, currency: "CNY", count: 0 };
        return mainTotal;
    }, [summary]);

    return (
        <Card
            className="hover:border-[var(--primary)] transition-colors cursor-pointer group relative"
            onClick={() => router.push(`/ledger/${ledger.id}`)}
        >
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{ledger.name}</CardTitle>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity -mr-2 -mt-2">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-[var(--muted)] hover:text-[var(--primary)] hover:bg-transparent"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(ledger);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-[var(--muted)] hover:text-[var(--danger)] hover:bg-transparent"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ledger);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-1">
                    <p className="text-2xl font-bold text-[var(--primary)]">
                        {stats.currency} {stats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                        {t("totalExpense", { count: stats.count })}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

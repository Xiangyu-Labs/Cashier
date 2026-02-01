"use client";

import { CategoryIcon } from "@/components/CategoryIcon";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";


interface CategoryStat {
    id: string | null;
    name: string;
    icon: string | null;
    totalConverted: number; // Converted Amount
    percent: number;        // % of total
    count: number;
    trend?: {
        percent: number;
        amount: number;
    };
}

interface StatsRankingProps {
    data: CategoryStat[];
    total: number;
    isLoading?: boolean;
    currencySymbol?: string;
}

export function StatsRanking({ data, total, isLoading, currencySymbol = "¥" }: StatsRankingProps) {
    const t = useTranslations("StatsTab");

    if (isLoading) {
        return (
            <div className="space-y-4 px-2">
                <div className="h-6 w-24 bg-surface2/50 rounded animate-pulse" />
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface2/50 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-1/3 bg-surface2/50 rounded animate-pulse" />
                            <div className="h-2 w-full bg-surface2/50 rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return null;
    }

    // Sort descending by converted amount
    const sorted = [...data].sort((a, b) => b.totalConverted - a.totalConverted);

    return (
        <div className="space-y-5 px-2">
            <h3 className="font-semibold text-lg flex items-center gap-2">
                {t("expenseRanking")}
            </h3>

            <div className="space-y-5">
                {sorted.map((cat, idx) => {
                    const percent = cat.percent;
                    // Trend Highlight
                    const isIncrease = cat.trend && cat.trend.percent > 20 && cat.trend.amount > 100; // Significant increase

                    return (
                        <div key={idx} className="flex items-center gap-3 group">
                            {/* Icon Circle */}
                            <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-lg shrink-0 group-hover:bg-primary/10 transition-colors">
                                <CategoryIcon iconName={cat.icon} className="w-5 h-5 text-text/80 group-hover:text-primary transition-colors" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-1.5">
                                {/* Top Line: Name + Amount */}
                                <div className="flex justify-between items-center text-sm">
                                    <div className="font-medium text-text">{cat.name}</div>
                                    <div className="font-mono font-medium tracking-tight">
                                        <span className="text-xs text-muted-foreground mr-0.5">{currencySymbol}</span>
                                        {cat.totalConverted.toFixed(2)}
                                    </div>
                                </div>

                                {/* Bottom Line: Progress + Detail */}
                                <div className="flex items-center gap-3">
                                    {/* Progress Bar */}
                                    <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>

                                    {/* Stats Detail */}
                                    <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
                                        <span>{percent.toFixed(0)}%</span>
                                        {/* Show trend if significant */}
                                        {cat.trend && Math.abs(cat.trend.percent) > 10 && (
                                            <span className={cn(
                                                "flex items-center gap-0.5",
                                                cat.trend.amount > 0 ? "text-destructive" : "text-primary"
                                            )}>
                                                {cat.trend.amount > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                {Math.abs(cat.trend.amount).toFixed(0)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

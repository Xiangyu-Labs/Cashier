"use client";

import { CategoryIcon } from "@/components/CategoryIcon";
import { useTranslations } from "next-intl";


interface CategoryStat {
    categoryId: string | null;
    categoryName: string;
    categoryIcon: string | null;
    currency: string | null;
    total: number;
    count: number;
}

interface StatsRankingProps {
    data: CategoryStat[];
    total: number;
    isLoading?: boolean;
}

export function StatsRanking({ data, total, isLoading }: StatsRankingProps) {
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

    // Sort descending just in case the API didn't
    const sorted = [...data].sort((a, b) => b.total - a.total);

    return (
        <div className="space-y-5 px-2">
            <h3 className="font-semibold text-lg flex items-center gap-2">
                {t("expenseRanking")}
            </h3>

            <div className="space-y-5">
                {sorted.map((cat, idx) => {
                    const percent = total > 0 ? (cat.total / total) * 100 : 0;
                    return (
                        <div key={idx} className="flex items-center gap-3 group">
                            {/* Icon Circle */}
                            <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-lg shrink-0 group-hover:bg-primary/10 transition-colors">
                                <CategoryIcon iconName={cat.categoryIcon} className="w-5 h-5 text-text/80 group-hover:text-primary transition-colors" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-1.5">
                                <div className="flex justify-between items-center text-sm">
                                    <div className="font-medium text-text">{cat.categoryName}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-medium">{cat.total.toFixed(2)}</span>
                                        <span className="text-xs text-muted-foreground w-8 text-right">{percent.toFixed(0)}%</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-1.5 w-full bg-surface2 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

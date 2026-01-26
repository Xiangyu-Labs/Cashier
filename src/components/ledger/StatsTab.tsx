"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TransactionSummary } from "@/types/api";

interface StatsTabProps {
    summary: TransactionSummary | undefined;
}

export function StatsTab({ summary }: StatsTabProps) {
    if (!summary) {
        return (
            <div className="py-8 text-center text-muted">
                正在加载数据...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="bg-gradient-to-br from-primary/10 to-surface">
                <CardHeader>
                    <CardTitle>本月概览</CardTitle>
                    <CardDescription>当月收支统计</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        {summary.totals.map((t, idx) => (
                            <div key={idx} className="space-y-1">
                                <p className="text-sm text-muted">总支出</p>
                                <p className="text-2xl font-bold font-mono text-primary">
                                    {t.currency} {t.total.toFixed(2)}
                                </p>
                            </div>
                        ))}
                        {summary.totals.length === 0 && (
                            <p className="text-muted col-span-2">暂无数据</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Placeholder for future charts */}
            <div className="text-center py-8 text-muted text-sm border-t border-border mt-8">
                更多图表分析功能开发中...
            </div>
        </div>
    );
}

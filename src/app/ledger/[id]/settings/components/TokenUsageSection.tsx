"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Zap } from "lucide-react";

interface TokenStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    taskCount: number;
    averageTokensPerTask: number;
}

async function fetchTokenStats(ledgerId: string): Promise<TokenStats> {
    const res = await fetch(`/api/ledgers/${ledgerId}/stats/tokens`);
    if (!res.ok) throw new Error("Failed to fetch token stats");
    return res.json();
}

export function TokenUsageSection({ ledgerId }: { ledgerId: string }) {
    const { data: stats, isLoading } = useQuery({
        queryKey: ["token-stats", ledgerId],
        queryFn: () => fetchTokenStats(ledgerId),
    });

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        AI Token 统计
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-24 bg-surface2/30 animate-pulse rounded" />
                </CardContent>
            </Card>
        );
    }

    if (!stats) return null;

    const formatNum = (num: number) => new Intl.NumberFormat().format(num);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    AI Token 统计 (估算)
                </CardTitle>
                <CardDescription>
                    基于字符长度估算的 GPT Token 消耗概览
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted">总消耗</p>
                        <p className="text-2xl font-bold">{formatNum(stats.totalTokens)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted">输入 Token</p>
                        <p className="text-xl">{formatNum(stats.totalInputTokens)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted">输出 Token</p>
                        <p className="text-xl">{formatNum(stats.totalOutputTokens)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted">平均/任务</p>
                        <p className="text-xl">{formatNum(stats.averageTokensPerTask)}</p>
                    </div>
                </div>
                <div className="mt-4 text-xs text-muted/50 border-t border-border pt-4">
                    * 统计范围仅包含通过新 GPT 任务系统处理的请求。计算方式为通用估算法 (1 Token ≈ 4 字符)，不代表实际计费 Token。
                </div>
            </CardContent>
        </Card>
    );
}

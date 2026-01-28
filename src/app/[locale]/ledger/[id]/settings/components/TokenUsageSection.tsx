"use client";

import { useQuery } from "@tanstack/react-query";

interface TokenStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    taskCount: number;
    averageTokensPerTask: number;
}

async function fetchTokenStats(ledgerId: string): Promise<TokenStats> {
    const res = await fetch(`/api/ledgers/${ledgerId}/processing-stats/token-usage`);
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
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <div className="mb-6 space-y-2">
                    <div className="h-6 w-32 bg-[var(--surface2)] animate-pulse rounded" />
                    <div className="h-4 w-64 bg-[var(--surface2)] animate-pulse rounded" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                    <div className="h-16 bg-[var(--surface2)] animate-pulse rounded" />
                    <div className="h-16 bg-[var(--surface2)] animate-pulse rounded" />
                    <div className="h-16 bg-[var(--surface2)] animate-pulse rounded" />
                    <div className="h-16 bg-[var(--surface2)] animate-pulse rounded" />
                </div>
            </section>
        );
    }

    if (!stats) return null;

    const formatNum = (num: number) => new Intl.NumberFormat().format(num);

    return (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
            <div className="mb-6">
                <h2 className="text-lg font-medium">AI Token 统计</h2>
                <p className="text-sm text-[var(--muted)]">
                    基于 gpt-tokenizer 精确计算的 GPT Token 消耗概览
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-[var(--muted)]">总消耗</p>
                    <p className="text-2xl font-bold">{formatNum(stats.totalTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-[var(--muted)]">输入 Token</p>
                    <p className="text-xl">{formatNum(stats.totalInputTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-[var(--muted)]">输出 Token</p>
                    <p className="text-xl">{formatNum(stats.totalOutputTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-[var(--muted)]">平均/任务</p>
                    <p className="text-xl">{formatNum(stats.averageTokensPerTask)}</p>
                </div>
            </div>
            <div className="mt-6 text-xs text-[var(--muted)] border-t border-[var(--border)] pt-4">
                * 统计范围仅包含通过新处理任务系统处理的请求。采用成熟的 `gpt-tokenizer` 精确计算。
            </div>
        </section>
    );
}

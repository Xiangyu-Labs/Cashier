"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Inbox, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { getProcessingStatsAction, getProcessingTasksAction } from "@/actions/processing";

// Use partial type or inferred type matching
interface ProcessingTask {
    id: string;
    title: string;
    status: string; // "running" | "completed" | "failed"
    startedAt?: string | null;
    createdAt: string;
}

function TaskStatusIcon({ status }: { status: any }) {
    switch (status) {
        case "running":
            return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
        case "completed":
            return <CheckCircle2 className="w-4 h-4 text-primary" />;
        case "failed":
            return <XCircle className="w-4 h-4 text-danger" />;
        default:
            return <Clock className="w-4 h-4 text-muted" />;
    }
}

function TaskStatusBadge({ status }: { status: any }) {
    const t = useTranslations("TaskCenter");
    const statusConfig: Record<string, { label: string; className: string }> = {
        running: { label: t("statusRunning"), className: "bg-primary/10 text-primary" },
        completed: { label: t("statusCompleted"), className: "bg-primary/10 text-primary" },
        failed: { label: t("statusFailed"), className: "bg-danger/10 text-danger" },
    };

    const config = statusConfig[status] || { label: status, className: "bg-muted/10 text-muted" };
    return (
        <span className={`text-[10px] px-1.5 py-0.5 font-medium rounded-sm ${config.className}`}>
            {config.label}
        </span>
    );
}

function ElapsedTime({ startedAt }: { startedAt: string | null }) {
    const [elapsed, setElapsed] = useState<string>("");

    useEffect(() => {
        if (!startedAt) return;
        const start = new Date(startedAt).getTime();

        const update = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((now - start) / 1000));
            const mins = Math.floor(diff / 60);
            const secs = diff % 60;
            setElapsed(`${mins}m ${secs}s`);
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [startedAt]);

    if (!startedAt) return null;
    return <span>{elapsed}</span>;
}

export function ProcessingSystemSection({ ledgerId }: { ledgerId: string }) {
    const t = useTranslations("TaskCenter");
    const tCommon = useTranslations("Common");
    const tSettings = useTranslations("Settings");

    const { data: stats, isLoading: isStatsLoading } = useQuery({
        queryKey: queryKeys.tokenStats(ledgerId),
        queryFn: () => getProcessingStatsAction(ledgerId),
    });

    const { data: tasks = [], isLoading: isTasksLoading } = useQuery({
        queryKey: queryKeys.processingTasks(ledgerId),
        queryFn: () => getProcessingTasksAction(ledgerId, { limit: 10 }), // Show last 10 tasks in settings
        enabled: !!ledgerId,
    });

    // Only show running tasks as "active" in the list below stats
    const activeTasks = tasks.filter((t: any) => t.status === "running");

    if (isStatsLoading && !stats) {
        return (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <div className="mb-6 space-y-2">
                    <div className="h-6 w-32 bg-[var(--surface2)] animate-pulse rounded" />
                    <div className="h-4 w-64 bg-[var(--surface2)] animate-pulse rounded" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-16 bg-[var(--surface2)] animate-pulse rounded" />
                    ))}
                </div>
            </section>
        );
    }

    if (!stats) return null;

    const formatNum = (num: number) => new Intl.NumberFormat().format(num);

    return (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
            <h2 className="text-lg font-medium mb-6">{tSettings("taskCenter")}</h2>

            <div className="mb-6">
                <h3 className="text-base font-medium">{t("processedTokenStats")}</h3>
                <p className="text-sm text-muted">
                    {t("tokenStatsDesc")}
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted">{t("totalConsumption")}</p>
                    <p className="text-2xl font-bold">{formatNum(stats.totalTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted">{t("inputTokens")}</p>
                    <p className="text-xl">{formatNum(stats.totalInputTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted">{t("outputTokens")}</p>
                    <p className="text-xl">{formatNum(stats.totalOutputTokens)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted">{t("averagePerTask")}</p>
                    <p className="text-xl">{formatNum(stats.averageTokensPerTask)}</p>
                </div>
            </div>

            <div className="mt-4 text-[10px] text-muted opacity-70">
                {t("tokenStatsFootnote")}
            </div>

            <div className="mt-8 pt-6 border-t border-border">
                <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-base font-medium">{t("activeTasks")}</h3>
                    {activeTasks.length > 0 && (
                        <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full leading-none font-bold">
                            {activeTasks.length}
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    {isTasksLoading && tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted">
                            <Loader2 className="w-6 h-6 animate-spin mb-2 opacity-50" />
                            <p className="text-xs">{tCommon("loading")}</p>
                        </div>
                    ) : activeTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 bg-surface2/30 rounded-lg">
                            <Inbox className="w-6 h-6 text-muted opacity-30" />
                            <p className="text-xs text-muted">{t("noActiveTasks")}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {activeTasks.map((task: any) => {
                                const statusColors: Record<string, string> = {
                                    queued: "border-l-muted/30",
                                    running: "border-l-primary",
                                    failed: "border-l-danger",
                                    completed: "border-l-primary",
                                    cancelled: "border-l-muted/20"
                                };

                                return (
                                    <div
                                        key={task.id}
                                        className={`group flex items-start gap-3 p-3 rounded-md transition-all bg-surface2/20 hover:bg-surface2/50 border-l-4 ${statusColors[task.status] || "border-l-transparent"}`}
                                    >
                                        <div className="mt-0.5 bg-surface rounded-full p-1.5 border border-border/50 shadow-sm">
                                            <TaskStatusIcon status={task.status} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 justify-between mb-0.5">
                                                <span className="text-sm font-medium text-text truncate tracking-tight" title={task.title}>
                                                    {task.title}
                                                </span>
                                                <TaskStatusBadge status={task.status} />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Clock className="w-3 h-3 text-muted/50" />
                                                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
                                                    {task.status === 'running' && task.startedAt ? (
                                                        <ElapsedTime startedAt={task.startedAt} />
                                                    ) : (
                                                        new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

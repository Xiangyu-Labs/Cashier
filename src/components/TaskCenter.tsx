"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGptTasks, GptTask } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Activity, Clock, Inbox, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface TaskCenterProps {
    ledgerId: string;
}

function TaskStatusIcon({ status }: { status: GptTask["status"] }) {
    switch (status) {
        case "queued":
            return <Clock className="w-4 h-4 text-muted" />;
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

function TaskStatusBadge({ status }: { status: GptTask["status"] }) {
    const statusConfig = {
        queued: { label: "排队中", className: "bg-muted/10 text-muted" },
        running: { label: "处理中", className: "bg-primary/10 text-primary" },
        completed: { label: "已完成", className: "bg-primary/10 text-primary" },
        failed: { label: "失败", className: "bg-danger/10 text-danger" },
        cancelled: { label: "已取消", className: "bg-surface2 text-muted" },
    };

    const config = statusConfig[status];
    return (
        <span className={`text-[10px] px-1.5 py-0.5 font-medium rounded-sm ${config.className}`}>
            {config.label}
        </span>
    );
}

export function TaskCenter({ ledgerId }: TaskCenterProps) {
    const { data: tasks = [], isLoading } = useQuery({
        queryKey: ["gpt-tasks", ledgerId],
        queryFn: () => fetchGptTasks(ledgerId, { limit: 50 }),
        refetchInterval: 3000,
        enabled: !!ledgerId,
    });

    const activeTasks = tasks.filter((t: GptTask) => t.status === "queued" || t.status === "running");
    const visibleTasks = tasks.filter((t: GptTask) => t.status !== "completed" && t.status !== "failed");

    const sessionTokens = tasks.reduce((sum: number, t: GptTask) => {
        const usage = (t.metadata as any)?.usage;
        return sum + (usage?.totalTokens || 0);
    }, 0);

    const formatTokens = (num: number) => {
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
        return num.toString();
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 px-1.5 md:px-2 text-muted hover:text-text font-normal transition-all duration-200">
                    {activeTasks.length > 0 ? (
                        <>
                            <div className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </div>
                            <span className="text-primary font-semibold text-xs whitespace-nowrap">
                                {activeTasks.length} <span className="hidden sm:inline">个任务处理中</span>
                            </span>
                        </>
                    ) : (
                        <>
                            <Activity className="w-4 h-4 opacity-70" />
                            <span className="hidden md:inline">任务中心</span>
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[calc(100vw-2rem)] sm:w-80 p-0 shadow-2xl border border-border bg-surface overflow-hidden"
                align="start"
                sideOffset={8}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface2/30">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight">任务队列</span>
                        {activeTasks.length > 0 && (
                            <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full leading-none font-bold">
                                {activeTasks.length}
                            </span>
                        )}
                    </div>
                    {sessionTokens > 0 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] md:text-xs font-semibold shrink-0" title="预估会话消耗">
                            <span>⚡️</span>
                            <span>{formatTokens(sessionTokens)}</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="max-h-[400px] overflow-y-auto">
                    <div className="p-1">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted">
                                <Loader2 className="w-6 h-6 animate-spin mb-2 opacity-50" />
                                <p className="text-xs">加载中...</p>
                            </div>
                        ) : visibleTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center">
                                    <Inbox className="w-6 h-6 text-muted opacity-30" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-text">暂无活跃任务</p>
                                    <p className="text-xs text-muted mt-0.5">新的记录处理将显示在这里</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {visibleTasks.map((task) => {
                                    const statusColors = {
                                        queued: "border-l-muted/30",
                                        running: "border-l-primary",
                                        failed: "border-l-danger",
                                        completed: "border-l-primary",
                                        cancelled: "border-l-muted/20"
                                    };

                                    return (
                                        <div
                                            key={task.id}
                                            className={`group flex items-start gap-3 p-3 rounded-md transition-all hover:bg-surface2/50 border-l-3 ${statusColors[task.status] || "border-l-transparent"}`}
                                        >
                                            <div className="mt-0.5 bg-surface rounded-full p-1.5 border border-border/50 shadow-sm group-hover:border-primary/30 group-hover:text-primary transition-colors">
                                                <TaskStatusIcon status={task.status} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 justify-between mb-0.5">
                                                    <span className="text-sm font-medium text-text truncate tracking-tight" title={task.title}>
                                                        {task.title}
                                                    </span>
                                                    <TaskStatusBadge status={task.status} />
                                                </div>
                                                {task.status === "failed" && task.error ? (
                                                    <p className="text-xs text-danger leading-snug line-clamp-2 mt-1 px-2 py-1 bg-danger/5 rounded border border-danger/10" title={task.error}>
                                                        {task.error}
                                                    </p>
                                                ) : (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Clock className="w-3 h-3 text-muted/50" />
                                                        <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
                                                            {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {visibleTasks.length > 0 && (
                    <div className="px-4 py-2 border-t border-border bg-surface2/30 flex justify-center">
                        <span className="text-[10px] text-muted font-medium tracking-widest uppercase">END OF QUEUE</span>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

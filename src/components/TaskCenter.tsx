"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGptTasks, GptTask } from "@/lib/api";
import { Bell, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TaskCenterProps {
    ledgerId: string;
}

function TaskStatusIcon({ status }: { status: GptTask["status"] }) {
    switch (status) {
        case "queued":
            return <Clock className="w-4 h-4 text-text/50" />;
        case "running":
            return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
        case "completed":
            return <CheckCircle2 className="w-4 h-4 text-success" />;
        case "failed":
            return <XCircle className="w-4 h-4 text-danger" />;
        case "cancelled":
            return <XCircle className="w-4 h-4 text-muted" />;
        default:
            return null;
    }
}

function TaskStatusBadge({ status }: { status: GptTask["status"] }) {
    const statusConfig = {
        queued: { label: "排队中", className: "bg-surface text-text/70" },
        running: { label: "处理中", className: "bg-primary/20 text-primary" },
        completed: { label: "已完成", className: "bg-success/20 text-success" },
        failed: { label: "失败", className: "bg-danger/20 text-danger" },
        cancelled: { label: "已取消", className: "bg-muted/20 text-muted" },
    };

    const config = statusConfig[status];
    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${config.className}`}>
            {config.label}
        </span>
    );
}

/**
 * TaskCenter component integrated into the status bar.
 * Replaces the old floating button.
 */
export function TaskCenter({ ledgerId }: TaskCenterProps) {
    const [activeTab, setActiveTab] = useState<"tasks" | "notifications">("tasks");

    const { data: tasks = [], isLoading } = useQuery({
        queryKey: ["gpt-tasks", ledgerId],
        queryFn: () => fetchGptTasks(ledgerId, { limit: 50 }),
        refetchInterval: 3000, // Poll every 3 seconds
        enabled: !!ledgerId,
    });

    const activeTasks = tasks.filter(t => t.status === "queued" || t.status === "running");
    const failedTasks = tasks.filter(t => t.status === "failed");
    const recentTasks = tasks.slice(0, 20);

    // Summary text for the trigger
    const getTaskSummary = () => {
        if (activeTasks.length === 0 && failedTasks.length === 0) return null;

        if (activeTasks.length > 0) {
            return (
                <span className="flex items-center gap-1 text-primary">
                    <span className="animate-spin rounded-full h-2 w-2 border-b border-primary"></span>
                    {activeTasks.length} {activeTasks.length === 1 ? "个任务处理中" : "个任务处理中"}
                </span>
            );
        }

        if (failedTasks.length > 0) {
            return (
                <span className="flex items-center gap-1 text-danger font-medium">
                    <span className="h-2 w-2 rounded-full bg-danger"></span>
                    {failedTasks.length} 个异常
                </span>
            );
        }

        return null;
    };

    const summary = getTaskSummary();
    if (!summary && recentTasks.length === 0) return null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="text-xs flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {summary || <span className="text-muted">任务队列</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 shadow-xl border-border" align="start">
                {/* Header with Tabs */}
                <div className="flex border-b border-border bg-surface2/50">
                    <button
                        onClick={() => setActiveTab("tasks")}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "tasks"
                            ? "text-primary border-b-2 border-primary"
                            : "text-text/60 hover:text-text"
                            }`}
                    >
                        任务
                        {activeTasks.length > 0 && (
                            <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                                {activeTasks.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("notifications")}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "notifications"
                            ? "text-primary border-b-2 border-primary"
                            : "text-text/60 hover:text-text"
                            }`}
                    >
                        <Bell className="w-4 h-4 inline-block mr-1" />
                        通知
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-96 overflow-y-auto">
                    {activeTab === "tasks" && (
                        <div className="p-2 space-y-2">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-text/50">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    加载中...
                                </div>
                            ) : recentTasks.length === 0 ? (
                                <div className="text-center py-8 text-text/50">
                                    暂无任务记录
                                </div>
                            ) : (
                                recentTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className={`flex items-start gap-2 p-2 rounded transition-colors ${task.status === "failed" ? "bg-danger/5" : "hover:bg-surface2/50"
                                            }`}
                                    >
                                        <div className="mt-0.5">
                                            <TaskStatusIcon status={task.status} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 justify-between">
                                                <span className="text-sm font-medium truncate flex-1" title={task.title}>
                                                    {task.title}
                                                </span>
                                                <TaskStatusBadge status={task.status} />
                                            </div>
                                            {task.status === "failed" && task.error && (
                                                <p className="text-xs text-danger mt-1 line-clamp-2" title={task.error}>
                                                    {task.error}
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between mt-1">
                                                <p className="text-[10px] text-text/40">
                                                    {new Date(task.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === "notifications" && (
                        <div className="flex flex-col items-center justify-center py-12 text-text/50">
                            <Bell className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-sm">暂无新通知</p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

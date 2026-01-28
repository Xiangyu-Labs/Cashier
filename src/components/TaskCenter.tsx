"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGptTasks, GptTask } from "@/lib/api";
import { ListTodo, Bell, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

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
    };

    const config = statusConfig[status];
    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${config.className}`}>
            {config.label}
        </span>
    );
}

export function TaskCenter({ ledgerId }: TaskCenterProps) {
    const [isOpen, setIsOpen] = useState(false);
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

    // Auto-close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (isOpen && !target.closest("[data-task-center]")) {
                setIsOpen(false);
            }
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [isOpen]);

    return (
        <div className="fixed bottom-4 right-4 z-50" data-task-center>
            {/* Floating Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="relative p-3 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 transition-colors"
                aria-label="任务中心"
            >
                <ListTodo size={24} />
                {activeTasks.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                        {activeTasks.length}
                    </span>
                )}
                {failedTasks.length > 0 && activeTasks.length === 0 && (
                    <span className="absolute -top-1 -right-1 bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                        !
                    </span>
                )}
            </button>

            {/* Panel */}
            {isOpen && (
                <div className="absolute bottom-16 right-0 w-80 bg-surface rounded-lg shadow-xl border border-border overflow-hidden">
                    {/* Header with Tabs */}
                    <div className="flex border-b border-border">
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
                                        暂无任务
                                    </div>
                                ) : (
                                    recentTasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className={`flex items-start gap-2 p-2 rounded transition-colors ${task.status === "failed" ? "bg-danger/10" : "bg-background"
                                                }`}
                                        >
                                            <TaskStatusIcon status={task.status} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm truncate flex-1" title={task.title}>
                                                        {task.title}
                                                    </span>
                                                    <TaskStatusBadge status={task.status} />
                                                </div>
                                                {task.status === "failed" && task.error && (
                                                    <p className="text-xs text-danger mt-1 line-clamp-2" title={task.error}>
                                                        {task.error}
                                                    </p>
                                                )}
                                                <p className="text-xs text-text/40 mt-0.5">
                                                    {new Date(task.createdAt).toLocaleTimeString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === "notifications" && (
                            <div className="flex items-center justify-center py-12 text-text/50">
                                <Bell className="w-5 h-5 mr-2 opacity-50" />
                                暂无通知
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

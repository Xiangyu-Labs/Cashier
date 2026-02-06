"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, MoreVertical, ChevronDown, Clock, Loader2, XCircle, CheckCircle2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { SerializedTaskRun } from "../server/actions/task-queue";

interface TaskCardProps {
    task: SerializedTaskRun;
    /** Whether this task type supports retry/delete operations */
    supportsActions?: boolean;
    onRetry?: () => void | Promise<void>;
    onDelete?: () => void;
    className?: string;
}

function TaskStatusIcon({ status }: { status: string }) {
    switch (status) {
        case "running":
            return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
        case "completed":
            return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
        case "failed":
            return <XCircle className="w-3.5 h-3.5 text-red-500" />;
        case "queued":
        default:
            return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
}

export const TaskCard = memo(function TaskCard({
    task,
    supportsActions = false,
    onRetry,
    onDelete,
    className,
}: TaskCardProps) {
    const tCommon = useTranslations("Common");
    const t = useTranslations("TaskQueue");

    const [isRetrying, setIsRetrying] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Determine status-specific styling
    const statusColors = {
        queued: "border-l-muted/30 bg-muted/5",
        running: "border-l-primary bg-primary/5",
        failed: "border-l-red-500 bg-red-50/50 dark:bg-red-900/10",
        completed: "border-l-primary/50 bg-surface",
    };

    async function handleRetry() {
        if (!onRetry) return;
        setIsRetrying(true);
        try {
            await onRetry();
        } finally {
            setIsRetrying(false);
        }
    }

    const hasDetails = task.progress || task.error;
    const showActions = supportsActions && (onRetry || onDelete) && task.status === "failed";

    return (
        <div className={cn(
            "rounded-lg border border-l-4 overflow-hidden transition-colors",
            statusColors[task.status as keyof typeof statusColors] || statusColors.queued,
            className
        )}>
            {/* Header */}
            <div
                className={cn(
                    "px-3 py-2.5 flex justify-between items-center transition-all",
                    hasDetails && "cursor-pointer hover:bg-surface2/50 active:scale-[0.995]"
                )}
                onClick={() => hasDetails && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {hasDetails && (
                        <ChevronDown className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
                            isExpanded && "rotate-180"
                        )} />
                    )}

                    <TaskStatusIcon status={task.status} />

                    {/* Title */}
                    <span className="text-sm font-medium text-text truncate" title={task.title}>
                        {task.title}
                    </span>

                    {/* Progress message (inline for running tasks) */}
                    {task.status === "running" && task.progress && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                            — {task.progress}
                        </span>
                    )}
                </div>

                {/* Actions */}
                {showActions && (
                    <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6 text-muted-foreground hover:text-text"
                                >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                                {onRetry && (
                                    <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                                        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRetrying && "animate-spin")} />
                                        {tCommon("retry")}
                                    </DropdownMenuItem>
                                )}
                                {onDelete && (
                                    <DropdownMenuItem
                                        onClick={onDelete}
                                        className="text-danger focus:text-danger"
                                    >
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        {tCommon("delete")}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {/* Expandable Content */}
            <AnimatePresence initial={false}>
                {isExpanded && hasDetails && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
                            {/* Progress */}
                            {task.progress && (
                                <div className="flex items-start gap-2">
                                    <span className="text-xs font-medium text-muted-foreground shrink-0">
                                        {t("progress")}:
                                    </span>
                                    <span className="text-xs text-text">
                                        {task.progress}
                                    </span>
                                </div>
                            )}

                            {/* Error */}
                            {task.error && (
                                <div className="flex items-start gap-2">
                                    <span className="text-xs font-medium text-red-500 shrink-0">
                                        {t("error")}:
                                    </span>
                                    <span className="text-xs text-red-600 dark:text-red-400">
                                        {task.error}
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

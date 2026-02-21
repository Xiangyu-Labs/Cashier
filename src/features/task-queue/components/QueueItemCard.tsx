"use client";

import { memo, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
    Trash2,
    RefreshCw,
    MoreVertical,
    ChevronDown,
    Clock,
    Loader2,
    XCircle,
    CheckCircle2,
    AlertTriangle,
    X,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { QueueItem, QueueItemStatus } from "../types/queue-item";
import { SourceDocumentPreview } from "./SourceDocumentPreview";

// Task type to i18n key mapping for unified display names
const TASK_TYPE_I18N: Record<string, string> = {
    'parse_source_document': 'taskType_parse_source_document',
    'categorize_entry': 'taskType_categorize_entry',
    'generate_category_metadata': 'taskType_generate_category_metadata',
};

interface QueueItemCardProps {
    item: QueueItem;
    ledgerId: string;
    /** Cancel handler - for pending/running tasks */
    onCancel?: () => void | Promise<void>;
    /** Retry handler - for failed/completed tasks and anomalies with sourceDocumentId */
    onRetry?: () => void | Promise<void>;
    /** Delete handler - for failed/pending tasks and anomalies with sourceDocumentId */
    onDelete?: () => void;
    /** Dismiss handler - for failed tasks without sourceDocumentId */
    onDismiss?: () => void | Promise<void>;
    className?: string;
}

function StatusIcon({ status }: { status: QueueItemStatus }) {
    switch (status) {
        case "running":
            return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
        case "completed":
            return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
        case "failed":
            return <XCircle className="w-3.5 h-3.5 text-red-500" />;
        case "anomaly":
            return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
        case "pending":
        default:
            return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
}

// Status-based styling
const statusStyles: Record<QueueItemStatus, string> = {
    pending: "border-l-muted/30 bg-muted/5",
    running: "border-l-primary bg-primary/5",
    failed: "border-l-red-500 bg-red-50/50 dark:bg-red-900/10",
    completed: "border-l-green-500 bg-green-50/50 dark:bg-green-900/10",
    anomaly: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10",
};

export const QueueItemCard = memo(function QueueItemCard({
    item,
    ledgerId,
    onCancel,
    onRetry,
    onDelete,
    onDismiss,
    className,
}: QueueItemCardProps) {
    const tCommon = useTranslations("Common");
    const t = useTranslations("TaskQueue");
    const _tEntries = useTranslations("LedgerEntriesTab");

    const [isRetrying, setIsRetrying] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Resolve display title: use i18n for known task types, fall back to stored title
    const displayTitle = useMemo(() => {
        const key = item.taskType ? TASK_TYPE_I18N[item.taskType] : undefined;
        return key ? t(key) : item.title;
    }, [item.taskType, item.title, t]);

    // Determine available actions based on item state
    const canCancel = item.kind === 'task' && (item.status === 'pending' || item.status === 'running') && onCancel;
    const canRetry = item.sourceDocumentId && onRetry && (item.status === 'failed' || item.status === 'anomaly' || item.status === 'pending' || item.status === 'completed' || item.status === 'running');
    const canDelete = item.sourceDocumentId && onDelete && (item.status === 'failed' || item.status === 'anomaly' || item.status === 'pending' || item.status === 'running');
    const canDismiss = item.kind === 'task' && item.status === 'failed' && !item.sourceDocumentId && onDismiss;

    // Running tasks without sourceDocumentId get direct cancel button (non-source-document tasks)
    const showDirectCancel = item.status === 'running' && canCancel && !item.sourceDocumentId;
    // For tasks with sourceDocumentId (pending/running), don't show cancel in dropdown
    // Users should use "Edit Retry" (modify+resubmit) or "Delete" (remove data) instead
    const showCancelInDropdown = canCancel && !item.sourceDocumentId;
    const showDropdown = canRetry || canDelete || canDismiss || showCancelInDropdown;

    // Can expand if has source document preview
    const canExpand = !!item.sourceDocumentId;

    async function handleRetry() {
        if (!onRetry) return;
        setIsRetrying(true);
        try {
            await onRetry();
        } finally {
            setIsRetrying(false);
        }
    }

    async function handleDismiss() {
        if (!onDismiss) return;
        setIsDismissing(true);
        try {
            await onDismiss();
        } finally {
            setIsDismissing(false);
        }
    }

    // Show subtitle (error/reason/progress) in title line always
    const showSubtitleInline = !!item.subtitle;
    const showProgressInline = item.status === 'running' && !!item.progress;

    return (
        <div className={cn(
            "rounded-lg border border-l-4 overflow-hidden transition-colors",
            statusStyles[item.status],
            className
        )}>
            {/* Header */}
            <div
                className={cn(
                    "px-3 py-2.5 flex justify-between items-center transition-all",
                    canExpand && "cursor-pointer hover:bg-surface2/50 active:scale-[0.995]"
                )}
                onClick={() => canExpand && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {canExpand && (
                        <ChevronDown className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
                            isExpanded && "rotate-180"
                        )} />
                    )}

                    <StatusIcon status={item.status} />

                    {/* Title */}
                    <span className="text-sm font-medium text-text truncate" title={displayTitle}>
                        {displayTitle}
                    </span>

                    {/* Subtitle (error/reason) - inline in title line */}
                    {showSubtitleInline && (
                        <span
                            className={cn(
                                "text-xs truncate hidden sm:inline",
                                item.status === 'anomaly' ? "text-amber-600" : "text-muted-foreground"
                            )}
                            title={item.subtitle}
                        >
                            — {item.subtitle}
                        </span>
                    )}

                    {/* Progress - inline for running tasks */}
                    {showProgressInline && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline" title={item.progress}>
                            — {item.progress}
                        </span>
                    )}
                </div>

                {/* Direct Cancel Button (for running tasks) */}
                {showDirectCancel && (
                    <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-muted-foreground hover:text-text"
                            onClick={onCancel}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}

                {/* Dropdown Menu (for pending/failed/completed/anomaly) */}
                {showDropdown && (
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
                                {canRetry && (
                                    <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                                        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRetrying && "animate-spin")} />
                                        {tCommon("retry")}
                                    </DropdownMenuItem>
                                )}
                                {showCancelInDropdown && (
                                    <DropdownMenuItem onClick={onCancel}>
                                        <X className="mr-2 h-3.5 w-3.5" />
                                        {t("cancel")}
                                    </DropdownMenuItem>
                                )}
                                {canDelete && (
                                    <DropdownMenuItem
                                        onClick={onDelete}
                                        className="text-danger focus:text-danger"
                                    >
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        {tCommon("delete")}
                                    </DropdownMenuItem>
                                )}
                                {canDismiss && (
                                    <DropdownMenuItem onClick={handleDismiss} disabled={isDismissing}>
                                        <XCircle className={cn("mr-2 h-3.5 w-3.5", isDismissing && "animate-pulse")} />
                                        {t("dismiss")}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {/* Mobile-only subtitle/progress line */}
            {(showSubtitleInline || showProgressInline) && (
                <div className="px-3 pb-2 sm:hidden">
                    {showSubtitleInline && (
                        <p className={cn(
                            "text-xs truncate",
                            item.status === 'anomaly' ? "text-amber-600" : "text-muted-foreground"
                        )}>
                            {item.subtitle}
                        </p>
                    )}
                    {showProgressInline && (
                        <p className="text-xs text-muted-foreground truncate">
                            {item.progress}
                        </p>
                    )}
                </div>
            )}

            {/* Expandable Content */}
            <AnimatePresence initial={false}>
                {isExpanded && canExpand && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-1 border-t border-border/50">
                            {/* Source Document Preview */}
                            {item.sourceDocumentId && (
                                <div className="pt-2">
                                    <div className="flex items-start gap-2">
                                        <span className="text-xs font-medium text-muted-foreground shrink-0">
                                            {t("originalInput")}:
                                        </span>
                                    </div>
                                    <div className="mt-1.5">
                                        <SourceDocumentPreview
                                            ledgerId={ledgerId}
                                            sourceDocumentId={item.sourceDocumentId}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

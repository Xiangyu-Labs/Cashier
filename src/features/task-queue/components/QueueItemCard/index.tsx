"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, MoreVertical, ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { QueueItem } from "../../types";
import { SourceDocumentPreview } from "../SourceDocumentPreview";
import { StatusIcon } from "./StatusIcon";
import { statusStyles } from "./constants";
import { useQueueItemActions } from "./useQueueItemActions";

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
  /** View details handler - for completed parse_source_document tasks */
  onViewDetails?: () => void;
  /** Default expanded state for the card content */
  defaultExpanded?: boolean;
  className?: string;
}

export const QueueItemCard = memo(function QueueItemCard({
  item,
  ledgerId,
  onCancel,
  onRetry,
  onDelete,
  onDismiss,
  onViewDetails,
  defaultExpanded = false,
  className,
}: QueueItemCardProps) {
  const tCommon = useTranslations("Common");
  const t = useTranslations("TaskQueue");

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const {
    displayTitle,
    isRetrying,
    isDismissing,
    canRetry,
    canDelete,
    canDismiss,
    showDirectCancel,
    showCancelInDropdown,
    showDropdown,
    canExpand,
    useSpecialInteraction,
    showSubtitleInline,
    showProgressInline,
    handleRetry,
    handleDismiss,
  } = useQueueItemActions({
    item,
    onCancel,
    onRetry,
    onDelete,
    onDismiss,
    onViewDetails,
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 overflow-hidden transition-colors",
        statusStyles[item.status],
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-3 py-2.5 flex justify-between items-center transition-all",
          canExpand &&
            !useSpecialInteraction &&
            "cursor-pointer hover:bg-surface2/50 active:scale-[0.995]"
        )}
        onClick={() => canExpand && !useSpecialInteraction && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {canExpand && useSpecialInteraction ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 -ml-1 hover:bg-accent/10 rounded shrink-0 transition-colors"
              aria-label={isExpanded ? t("collapse") : t("expand")}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform text-muted-foreground",
                  isExpanded && "rotate-180"
                )}
              />
            </button>
          ) : canExpand ? (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
                isExpanded && "rotate-180"
              )}
            />
          ) : null}

          <StatusIcon status={item.status} />

          {/* Title */}
          {useSpecialInteraction ? (
            <div
              onClick={onViewDetails}
              className="text-sm font-medium text-text truncate cursor-pointer hover:text-primary transition-colors"
              title={displayTitle}
            >
              {displayTitle}
            </div>
          ) : (
            <span className="text-sm font-medium text-text truncate" title={displayTitle}>
              {displayTitle}
            </span>
          )}

          {/* Subtitle (error/reason) - inline */}
          {showSubtitleInline && (
            <span
              className={cn(
                "text-xs truncate hidden sm:inline",
                item.status === "anomaly" ? "text-amber-600" : "text-muted-foreground"
              )}
              title={item.subtitle}
            >
              — {item.subtitle}
            </span>
          )}

          {/* Progress - inline for running tasks */}
          {showProgressInline && (
            <span
              className="text-xs text-muted-foreground truncate hidden sm:inline"
              title={item.progress}
            >
              — {item.progress}
            </span>
          )}
        </div>

        {/* Direct Cancel Button */}
        {showDirectCancel && (
          <div
            className="flex items-center gap-1 shrink-0 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
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

        {/* Dropdown Menu */}
        {showDropdown && (
          <div
            className="flex items-center gap-1 shrink-0 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
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
                  <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                )}
                {canDismiss && (
                  <DropdownMenuItem onClick={handleDismiss} disabled={isDismissing}>
                    <X className={cn("mr-2 h-3.5 w-3.5", isDismissing && "animate-pulse")} />
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
            <p
              className={cn(
                "text-xs truncate",
                item.status === "anomaly" ? "text-amber-600" : "text-muted-foreground"
              )}
            >
              {item.subtitle}
            </p>
          )}
          {showProgressInline && (
            <p className="text-xs text-muted-foreground truncate">{item.progress}</p>
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
              {item.sourceDocumentId != null && item.sourceDocumentId !== "" && (
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

export { StatusIcon } from "./StatusIcon";
export { statusStyles, TASK_TYPE_I18N } from "./constants";
export { useQueueItemActions } from "./useQueueItemActions";

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
import type { QueueItem } from "@/modules/task-queue/contracts";
import { SourceDocumentPreview } from "../SourceDocumentPreview";
import { StatusIcon } from "./StatusIcon";
import { statusStyles } from "./constants";
import { useQueueItemActions } from "./useQueueItemActions";

interface QueueItemCardProps {
  item: QueueItem;
  ledgerId: string;
  onCancel?: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onDelete?: () => void;
  onDismiss?: () => void | Promise<void>;
  onViewDetails?: () => void;
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
    ...(onCancel !== undefined ? { onCancel } : {}),
    ...(onRetry !== undefined ? { onRetry } : {}),
    ...(onDelete !== undefined ? { onDelete } : {}),
    ...(onDismiss !== undefined ? { onDismiss } : {}),
    ...(onViewDetails !== undefined ? { onViewDetails } : {}),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-l-4 transition-colors",
        statusStyles[item.status],
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2.5 transition-all",
          canExpand &&
            !useSpecialInteraction &&
            "cursor-pointer hover:bg-surface2/50 active:scale-[0.995]"
        )}
        onClick={() => canExpand && !useSpecialInteraction && setIsExpanded(!isExpanded)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {canExpand && useSpecialInteraction ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0 rounded p-1 -ml-1 transition-colors hover:bg-accent/10"
              aria-label={isExpanded ? t("collapse") : t("expand")}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </button>
          ) : canExpand ? (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                isExpanded && "rotate-180"
              )}
            />
          ) : null}

          <StatusIcon status={item.status} />

          {useSpecialInteraction ? (
            <div
              onClick={onViewDetails}
              className="cursor-pointer truncate text-sm font-medium text-text transition-colors hover:text-primary"
              title={displayTitle}
            >
              {displayTitle}
            </div>
          ) : (
            <span className="truncate text-sm font-medium text-text" title={displayTitle}>
              {displayTitle}
            </span>
          )}

          {showSubtitleInline && (
            <span
              className={cn(
                "hidden truncate text-xs sm:inline",
                item.status === "anomaly" ? "text-amber-600" : "text-muted-foreground"
              )}
              title={item.subtitle}
            >
              - {item.subtitle}
            </span>
          )}

          {showProgressInline && (
            <span
              className="hidden truncate text-xs text-muted-foreground sm:inline"
              title={item.progress}
            >
              - {item.progress}
            </span>
          )}
        </div>

        {showDirectCancel && (
          <div
            className="ml-2 flex shrink-0 items-center gap-1"
            onClick={(event) => event.stopPropagation()}
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

        {showDropdown && (
          <div
            className="ml-2 flex shrink-0 items-center gap-1"
            onClick={(event) => event.stopPropagation()}
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

      {(showSubtitleInline || showProgressInline) && (
        <div className="px-3 pb-2 sm:hidden">
          {showSubtitleInline && (
            <p
              className={cn(
                "truncate text-xs",
                item.status === "anomaly" ? "text-amber-600" : "text-muted-foreground"
              )}
            >
              {item.subtitle}
            </p>
          )}
          {showProgressInline && (
            <p className="truncate text-xs text-muted-foreground">{item.progress}</p>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && canExpand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-3 pb-3 pt-1">
              {item.sourceDocumentId != null && item.sourceDocumentId !== "" && (
                <div className="pt-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
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

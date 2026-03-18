/**
 * Queue Item Actions Hook
 *
 * Manages action handlers and permissions for queue items.
 */

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { TASK_TYPE_I18N } from "./constants";
import {
  canCancel as canCancelItem,
  canDelete as canDeleteItem,
  canDismiss as canDismissItem,
  canRetry as canRetryItem,
  hasSourceDocument,
  type QueueItem,
} from "../../types";

interface UseQueueItemActionsOptions {
  item: QueueItem;
  onCancel?: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onDelete?: () => void;
  onDismiss?: () => void | Promise<void>;
  onViewDetails?: () => void;
}

interface UseQueueItemActionsResult {
  // Display
  displayTitle: string;
  // Action states
  isRetrying: boolean;
  isDismissing: boolean;
  // Permissions
  canCancel: boolean;
  canRetry: boolean;
  canDelete: boolean;
  canDismiss: boolean;
  // UI flags
  showDirectCancel: boolean;
  showCancelInDropdown: boolean;
  showDropdown: boolean;
  canExpand: boolean;
  useSpecialInteraction: boolean;
  showSubtitleInline: boolean;
  showProgressInline: boolean;
  // Handlers
  handleRetry: () => Promise<void>;
  handleDismiss: () => Promise<void>;
}

export function useQueueItemActions({
  item,
  onCancel,
  onRetry,
  onDelete,
  onDismiss,
  onViewDetails,
}: UseQueueItemActionsOptions): UseQueueItemActionsResult {
  const t = useTranslations("TaskQueue");

  const [isRetrying, setIsRetrying] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  // Resolve display title
  const displayTitle = useMemo(() => {
    // For completed parse_source_document tasks, use the enriched title from backend
    if (item.status === "completed" && item.taskType === "parse_source_document") {
      return item.title;
    }
    const key = typeof item.taskType === "string" ? TASK_TYPE_I18N[item.taskType] : undefined;
    return typeof key === "string" ? t(key) : item.title;
  }, [item.status, item.taskType, item.title, t]);

  // Determine available actions
  const canCancel = canCancelItem(item) && onCancel != null;
  const canRetry = canRetryItem(item) && onRetry != null;
  const canDelete = canDeleteItem(item) && onDelete != null;
  const canDismiss = canDismissItem(item) && onDismiss != null;

  // UI flags
  const showDirectCancel = item.status === "running" && canCancel;
  const showCancelInDropdown = canCancel;
  const showDropdown = canRetry || canDelete || canDismiss || showCancelInDropdown;
  const canExpand = hasSourceDocument(item);
  const useSpecialInteraction =
    item.status === "completed" && item.taskType === "parse_source_document" && onViewDetails != null;

  // Content flags
  const showSubtitleInline = typeof item.subtitle === "string" && item.subtitle.length > 0;
  const showProgressInline = item.status === "running" && typeof item.progress === "string" && item.progress.length > 0;

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

  return {
    displayTitle,
    isRetrying,
    isDismissing,
    canCancel,
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
  };
}

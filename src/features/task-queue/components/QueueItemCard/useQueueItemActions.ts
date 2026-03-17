/**
 * Queue Item Actions Hook
 *
 * Manages action handlers and permissions for queue items.
 */

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { TASK_TYPE_I18N } from "./constants";
import type { QueueItem } from "../../types";

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
    const key = item.taskType ? TASK_TYPE_I18N[item.taskType] : undefined;
    return key ? t(key) : item.title;
  }, [item.status, item.taskType, item.title, t]);

  // Determine available actions
  const canCancel =
    item.kind === "task" && (item.status === "pending" || item.status === "running") && onCancel != null;

  const canRetry =
    item.sourceDocumentId != null &&
    item.sourceDocumentId !== "" &&
    onRetry != null &&
    (item.status === "failed" ||
      item.status === "anomaly" ||
      item.status === "pending" ||
      item.status === "completed" ||
      item.status === "running");

  const canDelete =
    item.sourceDocumentId != null &&
    item.sourceDocumentId !== "" &&
    onDelete != null &&
    (item.status === "failed" ||
      item.status === "anomaly" ||
      item.status === "pending" ||
      item.status === "running");

  const canDismiss =
    item.kind === "task" && item.status === "failed" && (item.sourceDocumentId == null || item.sourceDocumentId === "") && onDismiss != null;

  // UI flags
  const showDirectCancel = item.status === "running" && canCancel && (item.sourceDocumentId == null || item.sourceDocumentId === "");
  const showCancelInDropdown = canCancel && (item.sourceDocumentId == null || item.sourceDocumentId === "");
  const showDropdown = canRetry || canDelete || canDismiss || showCancelInDropdown;
  const canExpand = item.sourceDocumentId != null && item.sourceDocumentId !== "";
  const useSpecialInteraction =
    item.status === "completed" && item.taskType === "parse_source_document" && onViewDetails != null;

  // Content flags
  const showSubtitleInline = item.subtitle != null && item.subtitle !== "";
  const showProgressInline = item.status === "running" && item.progress != null && item.progress !== "";

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

"use client";

import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { TaskGroupSection } from "./TaskGroupSection";
import { QueueItemCard } from "./QueueItemCard";
import { Button } from "@/components/ui/button";
import type { QueueItem } from "../types";

interface TaskQueueContentProps {
  ledgerId: string;
  isLoading: boolean;
  isEmpty: boolean;
  groupedItems: {
    pending: QueueItem[];
    running: QueueItem[];
    failed: QueueItem[];
    completed: QueueItem[];
    anomaly: QueueItem[];
  };
  collapsedState: {
    isPendingCollapsed: boolean;
    isRunningCollapsed: boolean;
    isFailedCollapsed: boolean;
    isAnomalyCollapsed: boolean;
    isCompletedCollapsed: boolean;
  };
  failedStats: {
    withSourceDoc: QueueItem[];
    withoutSourceDoc: QueueItem[];
  };
  onTogglePending: () => void;
  onToggleRunning: () => void;
  onToggleFailed: () => void;
  onToggleAnomaly: () => void;
  onToggleCompleted: () => void;
  onRetry: (item: QueueItem) => void;
  onDeleteSingle: (item: QueueItem) => void;
  onDeleteAll: () => void;
  onRetryAll: (status: 'failed' | 'anomaly') => void;
  onCancel: (item: QueueItem) => void;
  onDismiss: (item: QueueItem) => void;
  onDismissAll: () => void;
  onViewDetails: (item: QueueItem) => void;
  onDeleteAllAnomaly?: (ids: string[]) => void;
}

export function TaskQueueContent({
  ledgerId,
  isLoading,
  isEmpty,
  groupedItems,
  collapsedState,
  failedStats,
  onTogglePending,
  onToggleRunning,
  onToggleFailed,
  onToggleAnomaly,
  onToggleCompleted,
  onRetry,
  onDeleteSingle,
  onDeleteAll,
  onRetryAll,
  onCancel,
  onDismiss,
  onDismissAll,
  onViewDetails,
  onDeleteAllAnomaly,
}: TaskQueueContentProps) {
  const t = useTranslations("TaskQueue");

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((idx) => (
          <div key={idx} className="bg-surface2 rounded-lg h-14" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="h-10 w-10 mb-3 opacity-40" />
        <p className="font-medium">{t("empty")}</p>
        <p className="text-xs opacity-70">{t("emptyDesc")}</p>
      </div>
    );
  }

  const { withSourceDoc: failedWithSourceDoc, withoutSourceDoc: failedWithoutSourceDoc } = failedStats;

  return (
    <>
      {/* Pending Section */}
      {groupedItems.pending.length > 0 && (
        <TaskGroupSection
          title={t("pending")}
          count={groupedItems.pending.length}
          color="muted"
          collapsed={collapsedState.isPendingCollapsed}
          onToggle={onTogglePending}
        >
          {groupedItems.pending.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              ledgerId={ledgerId}
              onCancel={() => onCancel(item)}
              onRetry={item.sourceDocumentId ? () => onRetry(item) : undefined}
              onDelete={item.sourceDocumentId ? () => onDeleteSingle(item) : undefined}
            />
          ))}
        </TaskGroupSection>
      )}

      {/* Running Section */}
      {groupedItems.running.length > 0 && (
        <TaskGroupSection
          title={t("running")}
          count={groupedItems.running.length}
          color="primary"
          collapsed={collapsedState.isRunningCollapsed}
          onToggle={onToggleRunning}
        >
          {groupedItems.running.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              ledgerId={ledgerId}
              onCancel={() => onCancel(item)}
              onRetry={item.sourceDocumentId ? () => onRetry(item) : undefined}
              onDelete={item.sourceDocumentId ? () => onDeleteSingle(item) : undefined}
            />
          ))}
        </TaskGroupSection>
      )}

      {/* Failed Section */}
      {groupedItems.failed.length > 0 && (
        <TaskGroupSection
          title={t("failed")}
          count={groupedItems.failed.length}
          color="red"
          collapsed={collapsedState.isFailedCollapsed}
          onToggle={onToggleFailed}
          actions={
            (failedWithSourceDoc.length > 0 || failedWithoutSourceDoc.length > 0) && (
              <>
                {failedWithoutSourceDoc.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                    onClick={onDismissAll}
                  >
                    {t("dismissAll")}
                  </Button>
                )}
                {failedWithSourceDoc.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200"
                      onClick={onDeleteAll}
                    >
                      {t("deleteAll")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onRetryAll('failed')}
                    >
                      {t("retryAll")}
                    </Button>
                  </>
                )}
              </>
            )
          }
        >
          {groupedItems.failed.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              ledgerId={ledgerId}
              onRetry={item.sourceDocumentId ? () => onRetry(item) : undefined}
              onDelete={item.sourceDocumentId ? () => onDeleteSingle(item) : undefined}
              onDismiss={!item.sourceDocumentId ? () => onDismiss(item) : undefined}
            />
          ))}
        </TaskGroupSection>
      )}

      {/* Anomaly Section */}
      {groupedItems.anomaly.length > 0 && (
        <TaskGroupSection
          title={t("anomaly")}
          count={groupedItems.anomaly.length}
          color="amber"
          collapsed={collapsedState.isAnomalyCollapsed}
          onToggle={onToggleAnomaly}
          actions={
            <>
              {onDeleteAllAnomaly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs bg-amber-50/50 text-amber-600 border-amber-100 hover:bg-amber-50 hover:border-amber-200"
                  onClick={() => {
                    const ids = groupedItems.anomaly.map(item => item.sourceDocumentId).filter(Boolean) as string[];
                    onDeleteAllAnomaly(ids);
                  }}
                >
                  {t("deleteAll")}
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600"
                onClick={() => onRetryAll('anomaly')}
              >
                {t("retryAll")}
              </Button>
            </>
          }
        >
          {groupedItems.anomaly.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              ledgerId={ledgerId}
              onRetry={() => onRetry(item)}
              onDelete={() => onDeleteSingle(item)}
            />
          ))}
        </TaskGroupSection>
      )}

      {/* Completed Section */}
      {groupedItems.completed.length > 0 && (
        <TaskGroupSection
          title={t("completed")}
          count={groupedItems.completed.length}
          color="green"
          collapsed={collapsedState.isCompletedCollapsed}
          onToggle={onToggleCompleted}
        >
          {groupedItems.completed.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              ledgerId={ledgerId}
              onRetry={item.sourceDocumentId ? () => onRetry(item) : undefined}
              onViewDetails={item.sourceDocumentId ? () => onViewDetails(item) : undefined}
            />
          ))}
        </TaskGroupSection>
      )}
    </>
  );
}

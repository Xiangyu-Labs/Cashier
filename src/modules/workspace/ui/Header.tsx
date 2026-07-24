"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentCountsAction, getStreamRefreshAction } from "@/modules/source-document/actions";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";
import { useRevisionStateRefresh, notifyNewSubmission } from "@/modules/source-document/hooks/revision-state-refresh";
import { cn } from "@/lib/utils";

interface HeaderProps {
  ledgerId: string;
  onOpenInput: () => void;
  onNeedsAttention?: () => void;
  onInProgress?: () => void;
}

export function Header({
  ledgerId,
  onOpenInput,
  onNeedsAttention,
  onInProgress,
}: HeaderProps) {
  const t = useTranslations("LedgerPage");
  const queryClient = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: queryKeys.sourceDocumentCounts(ledgerId),
    queryFn: () => getSourceDocumentCountsAction(ledgerId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Register counts refresh with the coordinator
  const refreshCounts = useCallback(async (): Promise<{ changed: boolean }> => {
    try {
      const result = await getStreamRefreshAction(ledgerId, {
        ledgerId,
        protocolVersion: 1,
        signatures: [],
        watchedIds: [],
        countFingerprint: null,
      });

      applyStreamRefreshToCache(queryClient, ledgerId, result);
      return { changed: result.changed };
    } catch {
      return { changed: false };
    }
  }, [ledgerId, queryClient]);

  // Register counts refresh — always pending to keep counts updated
  useRevisionStateRefresh({
    scope: `counts:${ledgerId}`,
    enabled: true,
    pending: true,
    refresh: refreshCounts,
  });

  const processingCount = counts?.processingCount ?? 0;
  const attentionCount = counts?.attentionCount ?? 0;
  const totalBadgeCount = processingCount + attentionCount;

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text">Cashier</span>
          {totalBadgeCount > 0 && (
            <div className="flex items-center gap-1.5">
              {processingCount > 0 && (
                <button
                  type="button"
                  onClick={onInProgress}
                  disabled={!onInProgress}
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    onInProgress && "cursor-pointer hover:ring-1 hover:ring-amber-400",
                    !onInProgress && "cursor-default"
                  )}
                  aria-label={t("inProgressPresetLabel", { count: processingCount })}
                >
                  {processingCount}
                </button>
              )}
              {attentionCount > 0 && (
                <button
                  type="button"
                  onClick={onNeedsAttention}
                  disabled={!onNeedsAttention}
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                    onNeedsAttention && "cursor-pointer hover:ring-1 hover:ring-red-400",
                    !onNeedsAttention && "cursor-default"
                  )}
                  aria-label={t("needsAttentionPresetLabel", { count: attentionCount })}
                >
                  {attentionCount}
                </button>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={onOpenInput}
          className="h-9 w-9 rounded-md p-0"
          aria-label={t("newRecord")}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

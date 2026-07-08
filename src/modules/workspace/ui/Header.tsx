"use client";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle, Clock, Timer } from "lucide-react";
import { useTranslations } from "next-intl";

interface HeaderProps {
  pendingStats: {
    total: number;
    pendingCount: number;
    runningCount: number;
    failedCount: number;
    anomalyCount: number;
  };
  onOpenTaskQueue: () => void;
  onOpenInput: () => void;
}

export function Header({ pendingStats, onOpenTaskQueue, onOpenInput }: HeaderProps) {
  const t = useTranslations("LedgerPage");
  const tTaskQueue = useTranslations("TaskQueue");

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenTaskQueue}
          aria-label={tTaskQueue("taskQueue")}
          title={tTaskQueue("taskQueue")}
          className="h-11 max-w-[calc(100vw-5rem)] justify-start gap-2 rounded-md px-2.5 text-sm font-medium hover:bg-surface2 sm:h-9 sm:max-w-none"
        >
          {pendingStats.total > 0 ? (
            <>
              <span className="truncate">{tTaskQueue("taskQueue")}</span>
              <span className="hidden items-center gap-1 sm:flex">
                {pendingStats.pendingCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{pendingStats.pendingCount}</span>
                  </span>
                )}
                {pendingStats.runningCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{pendingStats.runningCount}</span>
                  </span>
                )}
                {pendingStats.failedCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-danger">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{pendingStats.failedCount}</span>
                  </span>
                )}
                {pendingStats.anomalyCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-warning">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{pendingStats.anomalyCount}</span>
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{tTaskQueue("taskQueue")}</span>
            </>
          )}
        </Button>

        <Button
          size="sm"
          onClick={onOpenInput}
          aria-label={t("newRecord")}
          title={t("newRecord")}
          className="h-11 w-11 rounded-md p-0 sm:h-9 sm:w-9"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

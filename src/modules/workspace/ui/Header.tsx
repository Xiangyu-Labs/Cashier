"use client";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle, Clock, Timer, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ledger } from "@/modules/ledger/contracts";

interface HeaderProps {
  ledger: Ledger;
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

export function Header({ ledger, pendingStats, onOpenTaskQueue, onOpenInput }: HeaderProps) {
  const t = useTranslations("LedgerPage");
  const tTaskQueue = useTranslations("TaskQueue");
  const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-surface/60">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4 transition-all duration-300 md:max-w-3xl lg:max-w-5xl">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface2 text-primary">
            <WalletCards className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-text">Cashier</div>
            <div className="font-mono text-[11px] text-muted-foreground">{mainCurrency}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTaskQueue}
            aria-label={tTaskQueue("taskQueue")}
            title={tTaskQueue("taskQueue")}
            className="ml-1 h-9 min-w-9 gap-1.5 rounded-full px-2 text-xs font-medium hover:bg-surface2"
          >
            {pendingStats.total > 0 ? (
              <>
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
              </>
            ) : (
              <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onOpenInput}
            aria-label={t("newRecord")}
            title={t("newRecord")}
            className="h-11 w-11 rounded-full p-0 sm:h-9 sm:w-9"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}

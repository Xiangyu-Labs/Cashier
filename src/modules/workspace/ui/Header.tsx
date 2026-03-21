"use client";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle, Clock, Timer } from "lucide-react";
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

export function Header({
  ledger: _ledger,
  pendingStats,
  onOpenTaskQueue,
  onOpenInput,
}: HeaderProps) {
  useTranslations("LedgerPage");

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-surface/60">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4 transition-all duration-300 md:max-w-3xl lg:max-w-5xl">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTaskQueue}
            className="h-8 gap-1.5 rounded-full px-2 text-xs font-medium hover:bg-surface2"
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
                  <span className="inline-flex items-center gap-0.5 text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{pendingStats.failedCount}</span>
                  </span>
                )}
                {pendingStats.anomalyCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{pendingStats.anomalyCount}</span>
                  </span>
                )}
              </>
            ) : (
              <Timer className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onOpenInput} className="h-8 w-8 rounded-full p-0">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

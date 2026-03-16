/**
 * Ledger Page Header
 *
 * Displays ledger name, task queue button, and add entry button.
 */

"use client";

import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertCircle, Clock, ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ledger } from "@/types/api";

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

export function Header({ ledger: _ledger, pendingStats, onOpenTaskQueue, onOpenInput }: HeaderProps) {
  useTranslations("LedgerPage"); // Keep translation namespace registered

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-md bg-surface/80 supports-[backdrop-filter]:bg-surface/60">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center transition-all duration-300">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTaskQueue}
            className="h-8 px-2 gap-1.5 text-xs font-medium rounded-full hover:bg-surface2"
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
              <ListTodo className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onOpenInput}
            className="rounded-full h-8 w-8 p-0"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

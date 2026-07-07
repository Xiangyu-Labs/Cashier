"use client";
import type { ReactNode } from "react";
import { Header } from "./Header";

interface AppShellProps {
  pendingStats: {
    total: number;
    pendingCount: number;
    runningCount: number;
    failedCount: number;
    anomalyCount: number;
  };
  onOpenTaskQueue: () => void;
  onOpenInput: () => void;
  children: ReactNode;
}

export function AppShell({
  pendingStats,
  onOpenTaskQueue,
  onOpenInput,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <Header
        pendingStats={pendingStats}
        onOpenTaskQueue={onOpenTaskQueue}
        onOpenInput={onOpenInput}
      />
      <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-24 sm:px-4 md:px-6">
        {children}
      </main>
    </div>
  );
}

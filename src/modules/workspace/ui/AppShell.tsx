"use client";
import type { ReactNode } from "react";
import { Header } from "./Header";

interface AppShellProps {
  ledgerId: string;
  onOpenInput: () => void;
  onNeedsAttention?: () => void;
  onInProgress?: () => void;
  children: ReactNode;
}

export function AppShell({
  ledgerId,
  onOpenInput,
  onNeedsAttention,
  onInProgress,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <Header
        ledgerId={ledgerId}
        onOpenInput={onOpenInput}
        {...(onNeedsAttention != null ? { onNeedsAttention } : {})}
        {...(onInProgress != null ? { onInProgress } : {})}
      />
      <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-24 sm:px-4 md:px-6">
        {children}
      </main>
    </div>
  );
}

"use client";
import type { ReactNode } from "react";
import { Header } from "./Header";

interface AppShellProps {
  navigation: ReactNode;
  children: ReactNode;
}

export function AppShell({ navigation, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <Header navigation={navigation} />
      <main className="relative z-content mx-auto w-full max-w-6xl px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 md:px-6 md:pb-6">
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-header h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {navigation}
      </div>
    </div>
  );
}

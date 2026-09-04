"use client";
import type { ReactNode } from "react";

interface HeaderProps {
  navigation: ReactNode;
}

export function Header({ navigation }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 bottom-0 z-header h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-14 md:border-b md:border-t-0 md:pb-0 md:backdrop-blur-md md:supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto h-full w-full max-w-6xl px-0 md:px-6">{navigation}</div>
    </header>
  );
}

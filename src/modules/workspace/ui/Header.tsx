"use client";
import type { ReactNode } from "react";

interface HeaderProps {
  navigation: ReactNode;
}

export function Header({ navigation }: HeaderProps) {
  return (
    <header className="sticky top-0 z-header hidden border-b border-border bg-surface/95 md:block md:backdrop-blur-md md:supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-stretch px-2 sm:px-4 md:px-6">
        {navigation}
      </div>
    </header>
  );
}

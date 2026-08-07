"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useExternalLoadingActivity } from "@/modules/workspace/pull-to-refresh-context";

interface HeaderProps {
  navigation: ReactNode;
}

export function Header({ navigation }: HeaderProps) {
  const t = useTranslations("PullToRefresh");
  const isExternalLoading = useExternalLoadingActivity();

  return (
    <header className="sticky top-0 z-header hidden border-b border-border bg-surface/95 md:block md:backdrop-blur-md md:supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-stretch px-2 sm:px-4 md:px-6">
        {navigation}
      </div>
      {isExternalLoading && (
        <div
          role="progressbar"
          aria-label={t("refreshing")}
          data-testid="startup-loading-progress"
          className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden"
        >
          <div className="startup-progress-bar h-full w-1/3 bg-primary motion-reduce:w-full" />
        </div>
      )}
    </header>
  );
}

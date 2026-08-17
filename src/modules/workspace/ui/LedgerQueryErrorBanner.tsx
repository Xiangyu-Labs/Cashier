"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface LedgerQueryErrorBannerProps {
  onRetry: () => void;
}

export function LedgerQueryErrorBanner({ onRetry }: LedgerQueryErrorBannerProps) {
  const t = useTranslations("LedgerQueryError");

  return (
    <div
      role="alert"
      data-testid="ledger-query-error-banner"
      className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-text"
    >
      <span aria-hidden className="size-3 rounded-full bg-danger" />
      <span>{t("description")}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto h-7 px-2 text-xs"
        onClick={onRetry}
      >
        {t("retry")}
      </Button>
    </div>
  );
}

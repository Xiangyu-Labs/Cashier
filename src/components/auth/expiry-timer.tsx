"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useCountdown } from "@/hooks/use-countdown";

interface ExpiryTimerProps {
  expiresAt: number | null; // Unix timestamp in seconds
  onExpired?: () => void;
  className?: string;
}

export function ExpiryTimer({ expiresAt, onExpired, className }: ExpiryTimerProps) {
  const { remaining, isExpired } = useCountdown({
    targetTime: expiresAt,
    onExpired,
  });

  const t = useTranslations("Auth");

  if (expiresAt == null) {
    return null;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const isUrgent = remaining > 0 && remaining <= 60;

  return (
    <div className={cn("text-sm", className)}>
      {!isExpired ? (
        <p className={cn("text-muted-foreground", isUrgent && "text-destructive font-medium")}>
          {t("codeExpiresTimer", { time: `${minutes}:${seconds.toString().padStart(2, "0")}` })}
        </p>
      ) : (
        <p className="text-destructive font-medium">{t("codeExpired")}</p>
      )}
    </div>
  );
}

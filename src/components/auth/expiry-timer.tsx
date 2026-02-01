"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface ExpiryTimerProps {
  expiresAt: number | null; // Unix timestamp in seconds
  onExpired?: () => void;
  className?: string;
}

export function ExpiryTimer({
  expiresAt,
  onExpired,
  className,
}: ExpiryTimerProps) {
  const [remaining, setRemaining] = useState(0);
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = expiresAt - now;
      const newRemaining = Math.max(0, diff);
      setRemaining(newRemaining);

      if (newRemaining === 0 && !hasExpired) {
        setHasExpired(true);
        onExpired?.();
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, hasExpired, onExpired]);

  const t = useTranslations("Auth");

  if (!expiresAt) {
    return null;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const isUrgent = remaining > 0 && remaining <= 60;

  return (
    <div className={cn("text-sm", className)}>
      {remaining > 0 ? (
        <p
          className={cn(
            "text-muted-foreground",
            isUrgent && "text-destructive font-medium"
          )}
        >
          {t("codeExpiresTimer", { time: `${minutes}:${seconds.toString().padStart(2, "0")}` })}
        </p>
      ) : (
        <p className="text-destructive font-medium">{t("codeExpired")}</p>
      )}
    </div>
  );
}

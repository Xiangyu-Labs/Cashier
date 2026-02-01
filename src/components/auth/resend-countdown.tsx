"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ResendCountdownProps {
  canResendAt: number | null; // Unix timestamp in seconds
  onResend: () => Promise<void>;
  disabled?: boolean;
}

export function ResendCountdown({
  canResendAt,
  onResend,
  disabled = false,
}: ResendCountdownProps) {
  const [remaining, setRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!canResendAt) {
      setRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = canResendAt - now;
      setRemaining(Math.max(0, diff));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [canResendAt]);

  const handleResend = async () => {
    setIsLoading(true);
    try {
      await onResend();
    } finally {
      setIsLoading(false);
    }
  };

  const t = useTranslations("Auth");
  const isDisabled = disabled || isLoading || remaining > 0;

  return (
    <Button
      variant="ghost"
      disabled={isDisabled}
      onClick={handleResend}
      className="text-sm"
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {remaining > 0 ? t("resendIn", { seconds: remaining }) : t("resend")}
    </Button>
  );
}

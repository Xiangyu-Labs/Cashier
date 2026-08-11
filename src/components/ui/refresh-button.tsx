"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function RefreshButton({ onRefresh, disabled = false, className }: RefreshButtonProps) {
  const t = useTranslations("Common");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const handleRefresh = async () => {
    if (status === "pending") return;
    setStatus("pending");
    try {
      await onRefresh();
      setStatus("success");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => void handleRefresh()}
        disabled={disabled || status === "pending"}
        aria-label={status === "error" ? t("refreshFailed") : t("refresh")}
      >
        {status === "success" ? (
          <Check className="h-4 w-4" />
        ) : (
          <RefreshCw className={cn("h-4 w-4", status === "pending" && "animate-spin")} />
        )}
      </Button>
      <span
        className={cn("text-xs", status === "error" ? "text-danger" : "sr-only")}
        aria-live="polite"
      >
        {status === "success" ? t("refreshSuccess") : status === "error" ? t("refreshFailed") : ""}
      </span>
    </div>
  );
}

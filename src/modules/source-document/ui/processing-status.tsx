import { AlertCircle, Ban, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ProcessingStatusType =
  | "processing"
  | "completed"
  | "error"
  | "candidate_pending"
  | "cancelled";

interface ProcessingStatusProps {
  status: ProcessingStatusType;
  label?: string;
  className?: string;
}

export function ProcessingStatus({ status, label, className }: ProcessingStatusProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");

  const config = {
    processing: {
      label: t("processing"),
      icon: Loader2,
      colorClass: "text-primary/70",
      bgClass: "bg-primary/70",
    },
    completed: {
      label: t("completed"),
      icon: CheckCircle2,
      colorClass: "text-primary",
      bgClass: "bg-primary",
    },
    error: {
      label: tCommon("error"),
      icon: AlertCircle,
      colorClass: "text-danger",
      bgClass: "bg-danger",
    },
    candidate_pending: {
      label: t("candidatePendingTitle"),
      icon: Clock,
      colorClass: "text-warning",
      bgClass: "bg-warning",
    },
    cancelled: {
      label: t("cancelled"),
      icon: Ban,
      colorClass: "text-muted-foreground",
      bgClass: "bg-muted-foreground",
    },
  };

  if (status === "completed") {
    return (
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {config.completed.label}
      </span>
    );
  }

  const configItem = config[status];
  const { label: configLabel, icon: Icon, colorClass, bgClass } = configItem;
  const displayLabel = label ?? configLabel;

  return (
    <div
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-md border border-border bg-surface2/50 px-2",
        className
      )}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="relative flex items-center justify-center">
        {status === "processing" ? (
          <Icon className={cn("w-3.5 h-3.5 animate-spin", colorClass)} />
        ) : status === "candidate_pending" || status === "cancelled" ? (
          <Icon className={cn("w-3.5 h-3.5", colorClass)} />
        ) : (
          <div className={cn("w-2 h-2 rounded-full", bgClass)} />
        )}
      </div>
      <span
        className={cn("max-w-32 truncate text-xs font-medium sm:max-w-48", colorClass)}
        data-testid="status-label"
        title={displayLabel}
      >
        {displayLabel}
      </span>
    </div>
  );
}

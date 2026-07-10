import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ProcessingStatusType = "queued" | "processing" | "completed" | "error";

interface ProcessingStatusProps {
  status: ProcessingStatusType;
  label?: string;
  className?: string;
}

export function ProcessingStatus({ status, label, className }: ProcessingStatusProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");

  const config = {
    queued: {
      label: t("queued"),
      icon: Clock,
      colorClass: "text-muted-foreground",
      bgClass: "bg-muted-foreground",
    },
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
  };

  if (status === "completed") {
    return null;
  }

  const configItem = config[status];
  const { label: configLabel, icon: Icon, colorClass, bgClass } = configItem;
  const displayLabel = label ?? configLabel;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div className="relative flex items-center justify-center">
        {status === "processing" ? (
          <Icon className={cn("w-3.5 h-3.5 animate-spin", colorClass)} />
        ) : status === "queued" ? (
          <Icon className={cn("w-3.5 h-3.5", colorClass)} />
        ) : (
          <div className={cn("w-2 h-2 rounded-full", bgClass)} />
        )}
      </div>
      <span className={cn("text-xs font-medium", colorClass)} data-testid="status-label">
        {displayLabel}
      </span>
    </div>
  );
}

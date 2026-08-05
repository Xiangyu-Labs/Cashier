import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export type ProcessingStatusType =
  "processing" | "completed" | "error" | "candidate_pending" | "cancelled";

interface ProcessingStatusProps {
  status: ProcessingStatusType;
  label?: string;
  className?: string;
}

export function ProcessingStatus({ status, label, className }: ProcessingStatusProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const reducedMotion = useReducedMotion();

  const config = {
    processing: {
      label: t("processing"),
      colorClass: "text-primary/70",
      bgClass: "bg-primary/70",
    },
    completed: {
      label: t("completed"),
      colorClass: "text-primary",
      bgClass: "bg-primary",
    },
    error: {
      label: tCommon("error"),
      colorClass: "text-danger",
      bgClass: "bg-danger",
    },
    candidate_pending: {
      label: t("candidatePendingTitle"),
      colorClass: "text-warning",
      bgClass: "bg-warning",
    },
    cancelled: {
      label: t("cancelled"),
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
  const { label: configLabel, colorClass, bgClass } = configItem;
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
        {status === "processing" && !reducedMotion ? (
          <svg
            viewBox="0 0 16 16"
            className="source-document-spinner size-3 text-primary/70"
            data-processing-ring
            aria-hidden
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="2.5"
            />
            <path
              d="M14 8a6 6 0 0 0-6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span
            className={cn(
              "block size-2 rounded-full",
              status === "processing" ? "size-3 bg-primary/70" : bgClass
            )}
            aria-hidden
          />
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

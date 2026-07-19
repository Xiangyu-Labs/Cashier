"use client";

import { memo } from "react";
import {
  CheckCheck,
  Pencil,
  RefreshCw,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type {
  SourceDocumentCandidateComparisonDto,
} from "@/modules/source-document/contracts";

interface SourceDocumentCardStatePanelProps {
  status: SourceDocumentStatusType;
  candidateComparison?: SourceDocumentCandidateComparisonDto | null;
  /** Whether a mutation is currently pending for this card. */
  isMutationPending: boolean;
  /** Whether Accept is currently running. */
  isAccepting?: boolean;
  /** Whether Abandon is currently running. */
  isAbandoning?: boolean;
  onAccept?: () => void | Promise<void>;
  onAbandon?: () => void | Promise<void>;
  onEditRetry?: () => void | Promise<void>;
  onViewDetails?: () => void;
}

export const SourceDocumentCardStatePanel = memo(function SourceDocumentCardStatePanel({
  status,
  candidateComparison,
  isMutationPending,
  isAccepting = false,
  isAbandoning = false,
  onAccept,
  onAbandon,
  onEditRetry,
  onViewDetails,
}: SourceDocumentCardStatePanelProps) {
  const t = useTranslations("SourceDocumentCard");
  if (status === "completed") {
    return null;
  }

  return (
    <div
      className="px-4 py-3 border-b border-border bg-surface2/30"
      data-testid="source-document-state-panel"
    >
      {status === "candidate_pending" && (
        <CandidatePanel
          comparison={candidateComparison ?? null}
          isMutationPending={isMutationPending}
          isAccepting={isAccepting}
          isAbandoning={isAbandoning}
          {...(onAccept != null ? { onAccept } : {})}
          {...(onAbandon != null ? { onAbandon } : {})}
          {...(onViewDetails != null ? { onViewDetails } : {})}
        />
      )}
      {status === "anomaly" && (
        <div className="space-y-2.5 px-4 py-3 border-b border-border bg-surface2/30">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertCircle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            {t("anomalyNeedsCorrection")}
          </p>
        </div>
      )}
      {status === "failed" && (
        <FailedPanel
          isMutationPending={isMutationPending}
          {...(onEditRetry != null ? { onEditRetry } : {})}
        />
      )}
      {(status === "queued" || status === "processing") && (
        <ProgressPanel status={status} />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function CandidatePanel({
  comparison,
  isMutationPending,
  isAccepting,
  isAbandoning,
  onAccept,
  onAbandon,
  onViewDetails,
}: {
  comparison: SourceDocumentCandidateComparisonDto | null;
  isMutationPending: boolean;
  isAccepting: boolean;
  isAbandoning: boolean;
  onAccept?: () => void | Promise<void>;
  onAbandon?: () => void | Promise<void>;
  onViewDetails?: () => void;
}) {
  const t = useTranslations("SourceDocumentCard");

  const hasComparison = comparison != null;
  const unchanged = hasComparison && !comparison.changed;

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
        {t("candidatePendingTitle")}
      </p>

      {hasComparison && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md bg-surface2 px-2.5 py-1.5">
            <span className="text-muted-foreground">{t("activeProjection")}</span>
            <div className="mt-0.5 font-mono tabular-nums font-medium text-text">
              {comparison.active.entryCount} {t("entries")} · {comparison.active.total}
            </div>
          </div>
          <div className="rounded-md bg-surface2 px-2.5 py-1.5 ring-1 ring-amber-500/30">
            <span className="text-amber-600 dark:text-amber-400">
              {t("candidateProjection")}
            </span>
            <div className="mt-0.5 font-mono tabular-nums font-medium text-text">
              {comparison.candidate.entryCount} {t("entries")} ·{" "}
              {comparison.candidate.total}
            </div>
          </div>
        </div>
      )}

      {unchanged && (
        <p className="text-xs text-muted-foreground">{t("candidateNoDifference")}</p>
      )}

      {!hasComparison && (
        <p className="text-xs text-muted-foreground">
          {t("candidateReviewDetail")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onAccept != null && (
          <Button
            size="sm"
            variant="default"
            disabled={isMutationPending}
            onClick={onAccept}
            className="h-9 min-h-[44px] sm:min-h-0 sm:h-8 text-xs gap-1.5"
            aria-label={t("acceptCandidate")}
          >
            <CheckCheck
              className={cn("h-3.5 w-3.5", isAccepting && "animate-pulse")}
            />
            {t("acceptCandidate")}
          </Button>
        )}
        {onAbandon != null && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isMutationPending}
            onClick={onAbandon}
            className="h-9 min-h-[44px] sm:min-h-0 sm:h-8 text-xs gap-1.5 text-muted-foreground"
            aria-label={t("abandonCandidate")}
          >
            <XCircle
              className={cn("h-3.5 w-3.5", isAbandoning && "animate-pulse")}
            />
            {t("abandonCandidate")}
          </Button>
        )}
        {!hasComparison && onViewDetails != null && (
          <Button
            size="sm"
            variant="outline"
            onClick={onViewDetails}
            className="h-9 min-h-[44px] sm:min-h-0 sm:h-8 text-xs gap-1.5"
          >
            {t("viewDetails")}
          </Button>
        )}
      </div>
    </div>
  );
}


function FailedPanel({
  isMutationPending,
  onEditRetry,
}: {
  isMutationPending: boolean;
  onEditRetry?: () => void | Promise<void>;
}) {
  const t = useTranslations("SourceDocumentCard");

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-danger">
        <RefreshCw className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
        {t("failedProcessing")}
      </p>
      {onEditRetry != null && (
        <Button
          size="sm"
          variant="default"
          disabled={isMutationPending}
          onClick={onEditRetry}
          className="h-9 min-h-[44px] sm:min-h-0 sm:h-8 text-xs gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t("editRetryAction")}
        </Button>
      )}
    </div>
  );
}

function ProgressPanel({ status }: { status: "queued" | "processing" }) {
  const t = useTranslations("SourceDocumentCard");
  const label = status === "queued" ? t("queued") : t("processing");
  const Icon = status === "queued" ? Clock : Loader2;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon
        className={cn("h-3.5 w-3.5", status === "processing" && "animate-spin")}
      />
      <span>{label}</span>
    </div>
  );
}

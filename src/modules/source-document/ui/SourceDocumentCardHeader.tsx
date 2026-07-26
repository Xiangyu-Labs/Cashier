import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import { memo } from "react";
import {
  ChevronDown,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  XCircle,
  CheckCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseDateString } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ProcessingStatus } from "./processing-status";
import { SourceDocumentCardTotal } from "./SourceDocumentCardTotal";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { toStableFailureCode, toStableAnomalyCode } from "@/application/contracts";
import type { DateProvenance } from "@/modules/source-document/stream-grouping";

interface SourceDocumentCardHeaderProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null | undefined;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  ledgerEntries: LedgerEntry[];
  mainCurrency: string;
  isExpanded: boolean;
  isRetrying: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  supportedActions: readonly SupportedSourceDocumentAction[];
  /** Date provenance from the unified stream grouping model. */
  dateProvenance?: DateProvenance;
  onToggleExpanded: () => void;
  onViewDetails?: (() => void) | undefined;
  onToggleSelect?: (() => void) | undefined;
  onDirectRetry?: (() => void | Promise<void>) | undefined;
  onEditRetry?: (() => void | Promise<void>) | undefined;
  onAcceptCandidate?: (() => void | Promise<void>) | undefined;
  onAbandonCandidate?: (() => void | Promise<void>) | undefined;
  onDelete?: (() => void) | undefined;
}

function getProcessingStatus(status: SourceDocumentStatusType) {
  if (status === "anomaly" || status === "failed") {
    return "error" as const;
  }

  if (status === "processing" || status === "completed" || status === "candidate_pending") {
    return status;
  }

  return null;
}

export const SourceDocumentCardHeader = memo(function SourceDocumentCardHeader({
  sourceDocument,
  status,
  anomalyReason,
  errorCode,
  ledgerEntries,
  mainCurrency,
  isExpanded,
  isRetrying,
  selectionMode,
  isSelected,
  supportedActions,
  dateProvenance,
  onToggleExpanded,
  onViewDetails,
  onToggleSelect,
  onDirectRetry,
  onEditRetry,
  onAcceptCandidate,
  onAbandonCandidate,
  onDelete,
}: SourceDocumentCardHeaderProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");
  const tDiag = useTranslations("DiagnosticCode");
  const locale = useLocale();

  const processingStatus = getProcessingStatus(status);
  const shouldShowProcessingStatus =
    processingStatus != null &&
    processingStatus !== "completed" &&
    (ledgerEntries.length === 0 ||
      status === "anomaly" ||
      status === "failed" ||
      status === "processing" ||
      status === "candidate_pending");

  // Derive stable error code for display
  const stableErrorCode =
    status === "anomaly"
      ? toStableAnomalyCode(anomalyReason)
      : status === "failed"
        ? toStableFailureCode(errorCode)
        : null;

  const hasAction = (action: SupportedSourceDocumentAction) => supportedActions.includes(action);

  // Build date label from provenance
  const dateLabel = (() => {
    if (dateProvenance === "submitted") {
      const d = new Date(sourceDocument.createdAt);
      return `${t("submittedOn")} ${d.toLocaleDateString(locale, { month: "long", day: "numeric" })}`;
    }
    if (dateProvenance === "unknown") {
      return t("dateUnknown");
    }
    const entryDate = sourceDocument.entryDate;
    if (entryDate != null && entryDate !== "") {
      return parseDateString(entryDate).toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
      });
    }
    const d = new Date(sourceDocument.createdAt);
    return `${t("submittedOn")} ${d.toLocaleDateString(locale, { month: "long", day: "numeric" })}`;
  })();

  return (
    <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center transition-all gap-1">
      {selectionMode && (
        <div className="mr-2 shrink-0" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            className="h-5 w-5"
            {...(onToggleSelect !== undefined ? { onCheckedChange: onToggleSelect } : {})}
          />
        </div>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggleExpanded();
        }}
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-ml-1.5 sm:h-8 sm:w-8"
        aria-label={isExpanded ? t("collapse") : t("expand")}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform text-muted-foreground hover:text-text",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      <button
        type="button"
        onClick={!selectionMode ? onViewDetails : undefined}
        disabled={selectionMode || onViewDetails == null}
        className={cn(
          "flex min-h-11 flex-1 items-center gap-2 overflow-hidden rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8",
          onViewDetails && !selectionMode && "cursor-pointer hover:bg-accent/5 active:bg-accent/10"
        )}
      >
        <span className="hidden sm:inline text-sm font-medium shrink-0">
          <DateDisplay
            dateLabel={dateLabel}
            {...(dateProvenance !== undefined ? { dateProvenance } : {})}
            t={t}
          />
        </span>
        {status !== "processing" &&
          status !== "failed" &&
          sourceDocument.title != null &&
          sourceDocument.title !== "" && (
            <>
              <span className="hidden sm:inline text-muted-foreground/30 shrink-0">·</span>
              <span className="text-sm font-semibold text-text truncate">
                {sourceDocument.title}
              </span>
            </>
          )}
        {sourceDocument.type === "manual" && (
          <span className="text-xs text-muted-foreground bg-surface2 px-1.5 py-0.5 rounded shrink-0">
            {t("quickEntry")}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {shouldShowProcessingStatus && (
          <ProcessingStatus
            status={processingStatus}
            {...(stableErrorCode != null
              ? { label: tDiag(stableErrorCode as string) }
              : status === "anomaly" && anomalyReason != null && anomalyReason !== ""
                ? { label: anomalyReason }
                : {})}
          />
        )}

        {!["processing", "anomaly", "failed", "candidate_pending"].includes(status) && (
          <SourceDocumentCardTotal entries={ledgerEntries} mainCurrency={mainCurrency} />
        )}

        <div className="flex items-center gap-1.5 ml-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-11 w-11 text-muted-foreground hover:text-text sm:h-8 sm:w-8"
                aria-label="source-document-card-actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Candidate actions */}
              {hasAction("accept_candidate") && onAcceptCandidate != null && (
                <DropdownMenuItem onClick={onAcceptCandidate}>
                  <CheckCheck className="mr-2 h-4 w-4 text-primary" />
                  {tActions("accept")}
                </DropdownMenuItem>
              )}
              {hasAction("abandon_candidate") && onAbandonCandidate != null && (
                <DropdownMenuItem onClick={onAbandonCandidate}>
                  <XCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                  {tActions("abandon")}
                </DropdownMenuItem>
              )}

              {/* Recovery actions for anomaly/failed */}
              {hasAction("retry") && onDirectRetry != null && (
                <DropdownMenuItem onClick={onDirectRetry} disabled={isRetrying}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                  {tActions("retry")}
                </DropdownMenuItem>
              )}
              {hasAction("edit_retry") && onEditRetry != null && (
                <DropdownMenuItem onClick={onEditRetry}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {tActions("editRetry")}
                </DropdownMenuItem>
              )}

              {(hasAction("accept_candidate") || hasAction("retry")) && onDelete != null && (
                <DropdownMenuSeparator />
              )}

              {onDelete != null && (
                <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {tCommon("delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DateDisplay({
  dateLabel,
  dateProvenance,
  t,
}: {
  dateLabel: string;
  dateProvenance?: DateProvenance;
  t: ReturnType<typeof useTranslations<"SourceDocumentCard">>;
}) {
  if (dateProvenance === "unknown") {
    return (
      <span className="text-muted-foreground italic" title={t("dateUnknown")}>
        {t("dateUnknown")}
      </span>
    );
  }
  if (dateProvenance === "submitted") {
    return (
      <span className="text-muted-foreground" title={t("submittedDateTitle")}>
        {dateLabel}
      </span>
    );
  }
  return <span className="text-muted-foreground">{dateLabel}</span>;
}

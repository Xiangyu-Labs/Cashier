import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import { memo } from "react";
import {
  CircleStop,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProcessingStatus } from "./processing-status";
import { SourceDocumentCardTotal } from "./SourceDocumentCardTotal";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { toStableFailureCode, toStableAnomalyCode } from "@/application/contracts";

interface SourceDocumentCardHeaderProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null | undefined;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  ledgerEntries: LedgerEntry[];
  mainCurrency: string;
  isRetrying: boolean;
  isCancelling: boolean;
  isAbandoning: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  supportedActions: readonly SupportedSourceDocumentAction[];
  showActions?: boolean;
  onToggleSelect?: (() => void) | undefined;
  onDirectRetry?: (() => void | Promise<void>) | undefined;
  onCancelProcessing?: (() => void | Promise<void>) | undefined;
  onAbandonCandidate?: (() => void | Promise<void>) | undefined;
  onEditRetry?: (() => void | Promise<void>) | undefined;
  onDelete?: (() => void) | undefined;
}

function getProcessingStatus(status: SourceDocumentStatusType) {
  if (status === "anomaly" || status === "failed") {
    return "error" as const;
  }

  if (
    status === "processing" ||
    status === "completed" ||
    status === "candidate_pending" ||
    status === "cancelled"
  ) {
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
  isRetrying,
  isCancelling,
  isAbandoning,
  selectionMode,
  isSelected,
  supportedActions,
  showActions = true,
  onToggleSelect,
  onDirectRetry,
  onCancelProcessing,
  onAbandonCandidate,
  onEditRetry,
  onDelete,
}: SourceDocumentCardHeaderProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");
  const tDiag = useTranslations("DiagnosticCode");

  const processingStatus = getProcessingStatus(status);
  const shouldShowProcessingStatus =
    processingStatus != null &&
    processingStatus !== "completed" &&
    (ledgerEntries.length === 0 ||
      status === "anomaly" ||
      status === "failed" ||
      status === "processing" ||
      status === "cancelled" ||
      status === "candidate_pending");

  // Derive stable error code for display
  const stableErrorCode =
    status === "anomaly"
      ? toStableAnomalyCode(anomalyReason)
      : status === "failed"
        ? toStableFailureCode(errorCode)
        : null;

  const hasAction = (action: SupportedSourceDocumentAction) => supportedActions.includes(action);

  return (
    <div className="flex min-h-[68px] items-center gap-3 px-3 py-3 sm:px-4">
      {selectionMode && (
        <div className="mr-2 shrink-0" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            className="h-5 w-5"
            {...(onToggleSelect !== undefined ? { onCheckedChange: onToggleSelect } : {})}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
        {status !== "processing" &&
          status !== "failed" &&
          sourceDocument.title != null &&
          sourceDocument.title !== "" && (
            <>
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
      </div>

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

        {!["processing", "anomaly", "failed", "candidate_pending", "cancelled"].includes(
          status
        ) && <SourceDocumentCardTotal entries={ledgerEntries} mainCurrency={mainCurrency} />}

        {showActions && (
          <div
            className="ml-1 flex items-center gap-1.5"
            onClick={(event) => event.stopPropagation()}
          >
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

                {hasAction("cancel_processing") && onCancelProcessing != null && (
                  <DropdownMenuItem onClick={onCancelProcessing} disabled={isCancelling}>
                    <CircleStop className="mr-2 h-4 w-4" />
                    {tActions("cancelProcessing")}
                  </DropdownMenuItem>
                )}

                {hasAction("abandon_candidate") &&
                  status !== "candidate_pending" &&
                  onAbandonCandidate != null && (
                    <DropdownMenuItem onClick={onAbandonCandidate} disabled={isAbandoning}>
                      <XCircle className="mr-2 h-4 w-4" />
                      {tActions("abandon")}
                    </DropdownMenuItem>
                  )}

                {hasAction("retry") && onDelete != null && <DropdownMenuSeparator />}

                {onDelete != null && (
                  <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
});

import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import { memo, useRef } from "react";
import {
  ChevronDown,
  CircleStop,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
import { toStableFailureCode, toStableInvalidCode } from "@/application/contracts";
import { useDiagnosticMessages } from "./use-diagnostic-messages";

interface SourceDocumentCardHeaderProps {
  sourceDocument: SourceDocument | SourceDocumentLight | SourceDocumentListItemDto;
  status: SourceDocumentStatusType;
  invalidReason?: string | null | undefined;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  ledgerEntries: LedgerEntry[];
  mainCurrency: string;
  isRetrying: boolean;
  isCancelling: boolean;
  isAbandoning: boolean;
  selectionMode: boolean;
  supportedActions: readonly SupportedSourceDocumentAction[];
  showActions?: boolean;
  isExpanded: boolean;
  hasExpandableContent?: boolean;
  contentId: string;
  onToggleExpanded: () => void;
  onViewDetails?: (() => void) | undefined;
  onViewDetailsIntent?: (() => void) | undefined;
  onDirectRetry?: (() => void | Promise<void>) | undefined;
  onCancelProcessing?: (() => void | Promise<void>) | undefined;
  onAbandonCandidate?: (() => void | Promise<void>) | undefined;
  onEditRetry?: (() => void | Promise<void>) | undefined;
  onEditRetryIntent?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

function getProcessingStatus(status: SourceDocumentStatusType) {
  if (status === "invalid" || status === "failed") {
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
  invalidReason,
  errorCode,
  ledgerEntries,
  mainCurrency,
  isRetrying,
  isCancelling,
  isAbandoning,
  selectionMode,
  supportedActions,
  showActions = true,
  isExpanded,
  hasExpandableContent = true,
  contentId,
  onToggleExpanded,
  onViewDetails,
  onViewDetailsIntent,
  onDirectRetry,
  onCancelProcessing,
  onAbandonCandidate,
  onEditRetry,
  onEditRetryIntent,
  onDelete,
}: SourceDocumentCardHeaderProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");
  const diagnosticMessages = useDiagnosticMessages();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const processingStatus = getProcessingStatus(status);
  const shouldShowProcessingStatus =
    processingStatus != null &&
    processingStatus !== "completed" &&
    (ledgerEntries.length === 0 ||
      status === "invalid" ||
      status === "failed" ||
      status === "processing" ||
      status === "cancelled" ||
      status === "candidate_pending");

  // Derive stable error code for display
  const stableErrorCode =
    status === "invalid"
      ? toStableInvalidCode(invalidReason)
      : status === "failed"
        ? toStableFailureCode(errorCode)
        : null;

  const hasAction = (action: SupportedSourceDocumentAction) => supportedActions.includes(action);

  return (
    <div
      className={cn(
        "flex h-[var(--selectable-card-header-height,68px)] items-center gap-1 py-2 pr-2 sm:pr-3",
        selectionMode ? "pl-11" : "pl-2 sm:pl-3"
      )}
    >
      {hasExpandableContent && !selectionMode ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-[var(--motion-feedback)]"
          aria-label={isExpanded ? t("collapse") : t("expand")}
          aria-expanded={isExpanded}
          aria-controls={contentId}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-[var(--motion-feedback)] ease-[var(--motion-state-ease)]",
              isExpanded && "rotate-180"
            )}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center" />
      )}

      <button
        type="button"
        onClick={onViewDetails}
        onPointerEnter={onViewDetailsIntent}
        onPointerDown={onViewDetailsIntent}
        onFocus={onViewDetailsIntent}
        disabled={onViewDetails == null}
        className="group flex min-h-11 min-w-0 flex-1 items-center rounded-md px-2 py-1 text-left transition-[color,background-color] duration-[var(--motion-feedback)] focus-visible:outline-none disabled:cursor-default sm:min-h-9"
      >
        <span className="flex min-w-0 items-center gap-2 rounded-sm group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-ring">
          <span className="truncate text-sm font-semibold text-text">
            {sourceDocument.title?.trim() || t("untitled")}
          </span>
          {sourceDocument.type === "manual" && (
            <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-xs text-muted-foreground">
              {t("quickEntry")}
            </span>
          )}
        </span>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {shouldShowProcessingStatus && (
          <ProcessingStatus
            status={processingStatus}
            {...(stableErrorCode != null
              ? { label: diagnosticMessages.label(stableErrorCode) }
              : status === "invalid" && invalidReason != null && invalidReason !== ""
                ? { label: invalidReason }
                : {})}
          />
        )}

        {!["processing", "invalid", "failed", "candidate_pending", "cancelled"].includes(
          status
        ) && (
          <div className="text-right">
            <SourceDocumentCardTotal entries={ledgerEntries} mainCurrency={mainCurrency} />
          </div>
        )}

        {showActions && (
          <div
            className="ml-1 flex items-center gap-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={menuTriggerRef}
                  variant="ghost"
                  size="icon-sm"
                  className="h-11 w-11 text-muted-foreground hover:text-text sm:h-8 sm:w-8"
                  aria-label={t("moreActions")}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  menuTriggerRef.current?.focus();
                }}
              >
                {/* Recovery actions for invalid/failed */}
                {hasAction("retry") && onDirectRetry != null && (
                  <DropdownMenuItem onClick={onDirectRetry} disabled={isRetrying}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                    {tActions("retry")}
                  </DropdownMenuItem>
                )}
                {hasAction("edit_retry") && onEditRetry != null && (
                  <DropdownMenuItem
                    onClick={onEditRetry}
                    onPointerEnter={onEditRetryIntent}
                    onFocus={onEditRetryIntent}
                  >
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

import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import { memo } from "react";
import { ChevronDown, MoreVertical, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseDateString } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ProcessingStatus } from "./processing-status";
import { SourceDocumentCardTotal } from "./SourceDocumentCardTotal";

interface SourceDocumentCardHeaderProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null | undefined;
  ledgerEntries: LedgerEntry[];
  mainCurrency: string;
  isExpanded: boolean;
  isRetrying: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleExpanded: () => void;
  onViewDetails?: (() => void) | undefined;
  onToggleSelect?: (() => void) | undefined;
  onRetry?: (() => void | Promise<void>) | undefined;
  onDelete?: (() => void) | undefined;
}

function getProcessingStatus(status: SourceDocumentStatusType) {
  if (status === "anomaly" || status === "failed") {
    return "error" as const;
  }

  if (status === "queued" || status === "processing" || status === "completed") {
    return status;
  }

  return null;
}

export const SourceDocumentCardHeader = memo(function SourceDocumentCardHeader({
  sourceDocument,
  status,
  anomalyReason,
  ledgerEntries,
  mainCurrency,
  isExpanded,
  isRetrying,
  selectionMode,
  isSelected,
  onToggleExpanded,
  onViewDetails,
  onToggleSelect,
  onRetry,
  onDelete,
}: SourceDocumentCardHeaderProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  const processingStatus = getProcessingStatus(status);
  const shouldShowProcessingStatus =
    processingStatus != null &&
    (ledgerEntries.length === 0 || status === "anomaly" || status === "failed");

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
        className="p-1.5 -ml-1.5 hover:bg-accent/10 rounded shrink-0 transition-colors"
        aria-label={isExpanded ? t("collapse") : t("expand")}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform text-muted-foreground hover:text-text",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      <div
        onClick={!selectionMode ? onViewDetails : undefined}
        className={cn(
          "flex items-center gap-2 overflow-hidden flex-1 px-2 py-1 -my-1 rounded",
          onViewDetails && !selectionMode && "cursor-pointer hover:bg-accent/5 active:bg-accent/10"
        )}
      >
        <span className="hidden sm:inline text-sm font-medium text-muted-foreground shrink-0">
          {(sourceDocument.entryDate != null && sourceDocument.entryDate !== ""
            ? parseDateString(sourceDocument.entryDate)
            : new Date(sourceDocument.createdAt)
          ).toLocaleDateString(locale, {
            month: "long",
            day: "numeric",
          })}
        </span>
        {status !== "processing" &&
          status !== "queued" &&
          status !== "failed" &&
          sourceDocument.title != null &&
          sourceDocument.title !== "" && (
            <>
              <span className="hidden sm:inline text-muted-foreground/30 shrink-0">·</span>
              <span className="text-sm font-semibold text-text truncate">{sourceDocument.title}</span>
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
            {...(status === "anomaly" && anomalyReason != null && anomalyReason !== ""
              ? { label: anomalyReason }
              : {})}
          />
        )}

        {!["queued", "processing", "anomaly", "failed"].includes(status) && (
          <SourceDocumentCardTotal entries={ledgerEntries} mainCurrency={mainCurrency} />
        )}

        <div className="flex items-center gap-1.5 ml-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 text-muted-foreground hover:text-text"
                aria-label="source-document-card-actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onRetry != null && sourceDocument.type !== "manual" && (
                <DropdownMenuItem onClick={onRetry} disabled={isRetrying}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                  {status === "queued" || status === "processing" || status === "failed"
                    ? tCommon("retry")
                    : t("editRetry")}
                </DropdownMenuItem>
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

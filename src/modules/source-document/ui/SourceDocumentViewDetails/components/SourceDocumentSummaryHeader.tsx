"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateFilter } from "@/components/ui/date-filter";
import { formatDateTimeForApi } from "@/lib/date-utils";
import type { SourceDocPendingChanges } from "@/modules/source-document/detail-types";
import { SourceDocumentTotal } from "./SourceDocumentTotal";

interface SourceDocumentSummaryHeaderProps {
  displayEntryDate: string;
  totalInMainCurrency: string;
  mainCurrency: string;
  staleConversionCount: number;
  unconvertedCount: number;
  onSourceDocChange: (changes: SourceDocPendingChanges) => void;
  fieldsDisabled: boolean;
  isInvalid: boolean;
}

/**
 * The document at a glance: when it happened and what it adds up to.
 */
export function SourceDocumentSummaryHeader({
  displayEntryDate,
  totalInMainCurrency,
  mainCurrency,
  staleConversionCount,
  unconvertedCount,
  onSourceDocChange,
  fieldsDisabled,
  isInvalid,
}: SourceDocumentSummaryHeaderProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");

  return (
    <div
      data-testid="source-document-date-row"
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-surface2/30 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* The row carries no visible labels; name the date for screen readers. */}
        <span className="sr-only">{t("transactionTime")}</span>
        <DateFilter
          value={displayEntryDate}
          onChange={(date) => {
            if (date) {
              onSourceDocChange({ entryDate: formatDateTimeForApi(date) });
            }
          }}
          size="sm"
          className="min-w-fit shrink-0"
          truncate={false}
          readOnly={fieldsDisabled}
          readOnlyTextClassName="font-medium text-muted-foreground"
          hideReadOnlyIcon
        />
        {isInvalid && (
          <Badge variant="error" className="h-5 rounded-full px-1.5 text-xs font-medium">
            {tCommon("error")}
          </Badge>
        )}
      </div>
      <SourceDocumentTotal
        totalInMainCurrency={totalInMainCurrency}
        mainCurrency={mainCurrency}
        staleConversionCount={staleConversionCount}
        unconvertedCount={unconvertedCount}
      />
    </div>
  );
}

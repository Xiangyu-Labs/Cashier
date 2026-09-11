"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateFilter } from "@/components/ui/date-filter";
import { formatDateTimeForApi } from "@/lib/date-utils";
import type { SourceDocPendingChanges } from "@/modules/source-document/detail-types";

interface SourceDocumentSummaryHeaderProps {
  displayEntryDate: string;
  onSourceDocChange: (changes: SourceDocPendingChanges) => void;
  fieldsDisabled: boolean;
  isInvalid: boolean;
}

export function SourceDocumentSummaryHeader({
  displayEntryDate,
  onSourceDocChange,
  fieldsDisabled,
  isInvalid,
}: SourceDocumentSummaryHeaderProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");

  return (
    <div
      data-testid="source-document-date-row"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      <span className="shrink-0 text-sm font-semibold text-muted-foreground">
        {t("transactionTime")}:
      </span>
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
      />
      {isInvalid && (
        <Badge variant="error" className="h-5 rounded-full px-1.5 text-xs font-medium">
          {tCommon("error")}
        </Badge>
      )}
    </div>
  );
}

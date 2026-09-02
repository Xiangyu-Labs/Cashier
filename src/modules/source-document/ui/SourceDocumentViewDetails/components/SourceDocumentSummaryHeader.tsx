"use client";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateFilter } from "@/components/ui/date-filter";
import { Wallet } from "lucide-react";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import type { SourceDocumentDetailDisplayEntry } from "../../source-document-detail-view-model";
import type { SourceDocPendingChanges } from "../../source-document-view-details-types";
import { CurrencyBreakdownItem } from "./CurrencyBreakdownItem";

interface SourceDocumentSummaryHeaderProps {
  displayEntryDate: string;
  onSourceDocChange: (changes: SourceDocPendingChanges) => void;
  fieldsDisabled: boolean;
  isAnomaly: boolean;
  createdAt: string;
  totalInMainCurrency: string;
  mainCurrency: string;
  staleConversionCount: number;
  unconvertedCount: number;
  uniqueCurrencies: string[];
  subtotalsByCurrency: Record<string, string>;
  displayEntries: SourceDocumentDetailDisplayEntry[];
}

export function SourceDocumentSummaryHeader({
  displayEntryDate,
  onSourceDocChange,
  fieldsDisabled,
  isAnomaly,
  createdAt,
  totalInMainCurrency,
  mainCurrency,
  staleConversionCount,
  unconvertedCount,
  uniqueCurrencies,
  subtotalsByCurrency,
  displayEntries,
}: SourceDocumentSummaryHeaderProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{t("transactionTime")}:</span>
          <DateFilter
            value={displayEntryDate}
            onChange={(date) => {
              if (date) {
                onSourceDocChange({ entryDate: formatDateTimeForApi(date) });
              }
            }}
            size="sm"
            className="h-8 min-w-fit shrink-0"
            truncate={false}
            disabled={fieldsDisabled}
          />
          {isAnomaly && (
            <Badge variant="error" className="h-5 rounded-full px-1.5 text-xs font-medium">
              {tCommon("error")}
            </Badge>
          )}
          <span className="text-muted-foreground/30 hidden sm:inline">|</span>
          <span className="hidden text-xs text-muted-foreground/50 sm:inline">
            {t("createdAt")}:{" "}
            {new Date(createdAt).toLocaleString(locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 py-1 text-sm">
        <Wallet className="h-3.5 w-3.5 text-primary/60" />
        <span className="text-xs font-medium text-muted-foreground/60">{t("totalAmount")}:</span>
        <AmountText variant="summary">
          {staleConversionCount > 0 ? "≈ " : ""}
          {formatCurrencyAmount(totalInMainCurrency, mainCurrency, locale)}
        </AmountText>
        {unconvertedCount > 0 ? (
          <span className="text-xs text-warning" role="status">
            {tCommon("incompleteAccountingProjection")}
          </span>
        ) : staleConversionCount > 0 ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t("pendingRecalculation")}
          </span>
        ) : null}
        {uniqueCurrencies.length > 1 && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-muted-foreground/30">·</span>
            {uniqueCurrencies.map((curr) => (
              <CurrencyBreakdownItem
                key={curr}
                currency={curr}
                amount={subtotalsByCurrency[curr] ?? "0"}
                mainCurrency={mainCurrency}
                entries={displayEntries}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";

interface SourceDocumentTotalProps {
  totalInMainCurrency: string;
  mainCurrency: string;
  staleConversionCount: number;
  unconvertedCount: number;
}

/**
 * The document total, shown at the end of the entry-list header so it sits on
 * the same line as the entries it sums up.
 */
export function SourceDocumentTotal({
  totalInMainCurrency,
  mainCurrency,
  staleConversionCount,
  unconvertedCount,
}: SourceDocumentTotalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* The total carries no visible label, so name it for screen readers. */}
      <span className="sr-only">{t("totalAmount")}</span>
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
    </div>
  );
}

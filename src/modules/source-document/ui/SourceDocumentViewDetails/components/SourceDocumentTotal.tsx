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
 * The document total, shown in the summary bar next to the date and entry
 * count it belongs to.
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
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {/* The label names the amount, so a bare number never floats unexplained. */}
      <span className="shrink-0 text-sm text-muted-foreground">{t("totalAmount")}</span>
      <AmountText variant="summary" className="text-lg">
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

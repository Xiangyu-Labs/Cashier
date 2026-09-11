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
 * The document total, presented the same way as the ledger stream toolbar's
 * total: one labelled amount, then any caveat about the conversion.
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
  const amount = formatCurrencyAmount(totalInMainCurrency, mainCurrency, locale);

  return (
    <div className="relative z-10 flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <AmountText variant="summary" className="whitespace-nowrap">
        {staleConversionCount > 0 ? "≈ " : ""}
        {t("totalAmount")} {amount}
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

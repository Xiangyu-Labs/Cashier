"use client";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import type { SourceDocumentDetailDisplayEntry } from "../../source-document-detail-view-model";
import { CurrencyBreakdownItem } from "./CurrencyBreakdownItem";

interface SourceDocumentTotalProps {
  totalInMainCurrency: string;
  mainCurrency: string;
  staleConversionCount: number;
  unconvertedCount: number;
  uniqueCurrencies: string[];
  subtotalsByCurrency: Record<string, string>;
  displayEntries: SourceDocumentDetailDisplayEntry[];
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
  uniqueCurrencies,
  subtotalsByCurrency,
  displayEntries,
}: SourceDocumentTotalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="shrink-0 text-sm font-semibold text-muted-foreground">
        {t("totalAmount")}:
      </span>
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
        <>
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
        </>
      )}
    </div>
  );
}

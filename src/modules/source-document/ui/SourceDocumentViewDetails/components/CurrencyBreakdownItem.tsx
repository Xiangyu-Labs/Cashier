"use client";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import Decimal from "decimal.js";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import type { SourceDocumentDetailDisplayEntry } from "../../source-document-detail-view-model";

interface CurrencyBreakdownItemProps {
  currency: string;
  amount: string;
  mainCurrency: string;
  entries: SourceDocumentDetailDisplayEntry[];
}

export function CurrencyBreakdownItem({
  currency,
  amount,
  mainCurrency,
  entries,
}: CurrencyBreakdownItemProps) {
  const locale = useLocale();
  const converted = useMemo(() => {
    const currencyEntries = entries.filter((e) => (e.currency ?? mainCurrency) === currency);
    return currencyEntries
      .reduce((total, entry) => total.plus(entry.convertedAmount ?? 0), new Decimal(0))
      .toFixed();
  }, [entries, currency, mainCurrency]);

  return (
    <span className="text-xs text-muted-foreground">
      <AmountText variant="group">{formatCurrencyAmount(amount, currency, locale)}</AmountText>
      {currency !== mainCurrency && (
        <span className="ml-1.5">(≈ {formatCurrencyAmount(converted, mainCurrency, locale)})</span>
      )}
    </span>
  );
}

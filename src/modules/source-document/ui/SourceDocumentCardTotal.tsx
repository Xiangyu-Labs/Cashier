import type { LedgerEntry } from "@/modules/ledger/contracts";
import { memo, useMemo } from "react";
import { useLocale } from "next-intl";

import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import { calculateSourceDocumentCardTotal } from "./source-document-card.utils";

interface SourceDocumentCardTotalProps {
  entries: LedgerEntry[];
  mainCurrency: string;
}

export const SourceDocumentCardTotal = memo(function SourceDocumentCardTotal({
  entries,
  mainCurrency,
}: SourceDocumentCardTotalProps) {
  const locale = useLocale();
  const total = useMemo(
    () => calculateSourceDocumentCardTotal(entries, mainCurrency),
    [entries, mainCurrency]
  );

  return (
    <AmountText variant="item">{formatCurrencyAmount(total, mainCurrency, locale)}</AmountText>
  );
});

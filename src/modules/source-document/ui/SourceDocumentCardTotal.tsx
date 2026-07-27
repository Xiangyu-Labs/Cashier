import type { LedgerEntry } from "@/modules/ledger/contracts";
import { memo, useMemo } from "react";
import { Coins } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText, amountTextClassName } from "@/modules/currency/ui";
import { buildSourceDocumentCardTotals } from "./source-document-card.utils";

interface SourceDocumentCardTotalProps {
  entries: LedgerEntry[];
  mainCurrency: string;
}

export const SourceDocumentCardTotal = memo(function SourceDocumentCardTotal({
  entries,
  mainCurrency,
}: SourceDocumentCardTotalProps) {
  const t = useTranslations("SourceDocumentCard");
  const locale = useLocale();

  const { subtotalsByCurrency, totalInMainCurrency, breakdownData } = useMemo(
    () => buildSourceDocumentCardTotals(entries, mainCurrency),
    [entries, mainCurrency]
  );

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const hasMultipleCurrencies = uniqueCurrencies.length > 1;

  const formattedTotal = formatCurrencyAmount(totalInMainCurrency, mainCurrency, locale);

  if (!hasMultipleCurrencies) {
    return <AmountText variant="item">{formattedTotal}</AmountText>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={amountTextClassName(
            "item",
            "inline-flex items-center gap-1 transition-colors hover:text-primary group"
          )}
          type="button"
        >
          {formattedTotal}
          <Coins className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Coins className="h-3 w-3" />
            {t("currencyBreakdown")}
          </div>
          <div className="space-y-1.5">
            {breakdownData.map(({ currency, amount, convertedAmount }) => (
              <div key={currency} className="flex justify-between items-center text-sm">
                <div className="ml-auto text-right">
                  <AmountText variant="item">
                    {formatCurrencyAmount(amount, currency, locale)}
                  </AmountText>
                  {currency !== mainCurrency && convertedAmount !== undefined && (
                    <AmountText variant="secondary" className="ml-1.5">
                      ≈ {formatCurrencyAmount(convertedAmount, mainCurrency, locale)}
                    </AmountText>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{t("convertedTotal")}</span>
            <AmountText variant="summary">{formattedTotal}</AmountText>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

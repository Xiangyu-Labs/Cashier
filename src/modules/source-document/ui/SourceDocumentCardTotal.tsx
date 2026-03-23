import type { LedgerEntry } from "@/modules/ledger/contracts";
import { memo, useMemo } from "react";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  const { subtotalsByCurrency, totalInMainCurrency, breakdownData } = useMemo(
    () => buildSourceDocumentCardTotals(entries, mainCurrency),
    [entries, mainCurrency]
  );

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const hasMultipleCurrencies = uniqueCurrencies.length > 1;

  const formattedTotal = totalInMainCurrency.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (!hasMultipleCurrencies) {
    return (
      <span className="text-sm font-bold text-text">
        <span className="text-xs text-muted-foreground mr-1">{mainCurrency}</span>
        {formattedTotal}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-sm font-bold text-text hover:text-primary transition-colors group"
          type="button"
        >
          <span className="text-xs text-muted-foreground mr-0.5">{mainCurrency}</span>
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
                <span className="text-muted-foreground">{currency}</span>
                <div className="text-right">
                  <span className="font-medium">
                    {amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {currency !== mainCurrency && convertedAmount !== undefined && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ≈ {mainCurrency}{" "}
                      {convertedAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{t("convertedTotal")}</span>
            <span className="text-sm font-bold text-primary">
              {mainCurrency} {formattedTotal}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

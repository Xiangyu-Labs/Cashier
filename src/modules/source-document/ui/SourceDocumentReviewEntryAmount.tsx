import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";

interface SourceDocumentReviewEntryAmountProps {
  amount: string;
  currency: string | null;
  convertedAmount: string | null;
  mainCurrency: string;
  locale: string;
}

export function SourceDocumentReviewEntryAmount({
  amount,
  currency,
  convertedAmount,
  mainCurrency,
  locale,
}: SourceDocumentReviewEntryAmountProps) {
  const displayCurrency = currency ?? mainCurrency;
  return (
    <div className="shrink-0 text-right">
      <AmountText variant="item">
        {formatCurrencyAmount(amount, displayCurrency, locale)}
      </AmountText>
      {convertedAmount != null && displayCurrency !== mainCurrency && (
        <AmountText variant="secondary">
          {formatCurrencyAmount(convertedAmount, mainCurrency, locale)}
        </AmountText>
      )}
    </div>
  );
}

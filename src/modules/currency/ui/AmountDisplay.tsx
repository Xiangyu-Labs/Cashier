"use client";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { useAmountDisplay } from "@/modules/currency/client";

interface AmountDisplayProps {
  amount: number;
  currency: string | null | undefined;
  mainCurrency: string;
  date?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  showOriginal?: boolean;
}

export function AmountDisplay({
  amount,
  currency,
  mainCurrency,
  date,
  className = "",
  size = "md",
  showOriginal = true,
}: AmountDisplayProps) {
  const locale = useLocale();
  const amountDisplayInput =
    date == null ? { amount, currency, mainCurrency } : { amount, currency, mainCurrency, date };

  const { displayAmount, isDifferentCurrency, originalCurrency } = useAmountDisplay({
    ...amountDisplayInput,
  });

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  return (
    <div className={`flex flex-col items-end ${className}`}>
      <p className={`font-mono font-semibold text-text ${sizeClasses[size]}`}>
        {formatCurrencyAmount(
          displayAmount,
          isDifferentCurrency ? mainCurrency : originalCurrency,
          locale
        )}
      </p>
      {isDifferentCurrency && showOriginal && (
        <p className="text-[10px] text-muted-foreground font-mono opacity-60">
          ≈ {formatCurrencyAmount(amount, originalCurrency, locale)}
        </p>
      )}
    </div>
  );
}

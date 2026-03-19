"use client";

import { formatAmountStandard } from "@/lib/formatters";
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
  const { displayAmount, isDifferentCurrency, originalCurrency } = useAmountDisplay({
    amount,
    currency,
    mainCurrency,
    date,
  });

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const currencySizeClasses = {
    sm: "text-xs",
    md: "text-xs",
    lg: "text-sm",
  };

  return (
    <div className={`flex flex-col items-end ${className}`}>
      <p className={`font-mono font-semibold text-text ${sizeClasses[size]}`}>
        <span className={`text-muted-foreground mr-1 ${currencySizeClasses[size]}`}>
          {isDifferentCurrency ? mainCurrency : originalCurrency}
        </span>
        {formatAmountStandard(displayAmount)}
      </p>
      {isDifferentCurrency && showOriginal && (
        <p className="text-[10px] text-muted-foreground font-mono opacity-60">
          ≈ {originalCurrency} {formatAmountStandard(amount)}
        </p>
      )}
    </div>
  );
}

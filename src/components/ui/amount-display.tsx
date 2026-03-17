"use client";

import { useAmountDisplay } from "@/features/currency/client/hooks/use-amount-display";
import { formatAmountStandard } from "@/lib/formatters";

interface AmountDisplayProps {
  /** The amount value */
  amount: number;
  /** The currency code */
  currency: string | null | undefined;
  /** The main currency to convert to */
  mainCurrency: string;
  /** Optional date for historical conversion rates */
  date?: string | null;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the original amount when different currency */
  showOriginal?: boolean;
}

/**
 * A component for displaying amounts with automatic currency conversion.
 * Shows converted amount in main currency and optionally the original amount.
 */
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

/**
 * Inline version of AmountDisplay for compact layouts.
 * Shows amount and currency on the same line.
 */
export function AmountDisplayInline({
  amount,
  currency,
  mainCurrency,
  date,
  className = "",
}: Omit<AmountDisplayProps, "size" | "showOriginal">) {
  const { displayAmount, isDifferentCurrency, originalCurrency } = useAmountDisplay({
    amount,
    currency,
    mainCurrency,
    date,
  });

  return (
    <span className={className}>
      {isDifferentCurrency ? (
        <>
          <span className="text-xs text-muted-foreground mr-1">{mainCurrency}</span>
          <span className="font-mono font-semibold">{formatAmountStandard(displayAmount)}</span>
          <span className="text-[10px] text-muted-foreground font-mono opacity-60 ml-1">
            (≈ {originalCurrency} {formatAmountStandard(amount)})
          </span>
        </>
      ) : (
        <>
          <span className="text-xs text-muted-foreground mr-1">{originalCurrency}</span>
          <span className="font-mono font-semibold">{formatAmountStandard(amount)}</span>
        </>
      )}
    </span>
  );
}

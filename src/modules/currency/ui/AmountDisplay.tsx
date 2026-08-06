"use client";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { useAmountDisplay } from "@/modules/currency/client";
import { cn } from "@/lib/utils";

export type AmountVariant = "hero" | "summary" | "group" | "item" | "secondary";

const amountVariantClasses: Record<AmountVariant, string> = {
  hero: "text-3xl font-semibold text-text sm:text-4xl",
  summary: "text-base font-semibold text-text",
  group: "text-xs font-medium text-muted-foreground",
  item: "text-base font-semibold text-text",
  secondary: "text-[10px] font-normal text-muted-foreground opacity-70",
};

export function amountTextClassName(variant: AmountVariant, className?: string) {
  return cn("font-mono tabular-nums", amountVariantClasses[variant], className);
}

export function AmountText({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant: AmountVariant;
  className?: string;
}) {
  return <span className={amountTextClassName(variant, className)}>{children}</span>;
}

interface AmountDisplayProps {
  ledgerId: string;
  amount: number;
  currency: string | null | undefined;
  mainCurrency: string;
  date?: string | null;
  persistedConvertedAmount?: string | null;
  className?: string;
  variant?: AmountVariant;
  showOriginal?: boolean;
}

export function AmountDisplay({
  ledgerId,
  amount,
  currency,
  mainCurrency,
  date,
  persistedConvertedAmount,
  className = "",
  variant = "item",
  showOriginal = true,
}: AmountDisplayProps) {
  const locale = useLocale();
  const { displayAmount, isDifferentCurrency, originalCurrency, status } = useAmountDisplay({
    ledgerId,
    amount,
    currency,
    mainCurrency,
    ...(date != null ? { date } : {}),
    ...(persistedConvertedAmount != null ? { persistedConvertedAmount } : {}),
  });

  // While loading or after a failed conversion the original amount is shown in
  // its own currency; the main-currency symbol must never label it.
  if (status === "loading" || status === "error") {
    return (
      <div
        className={`flex flex-col items-end ${className}`}
        {...(status === "loading" ? { "aria-busy": true } : {})}
      >
        <AmountText variant={variant}>
          {formatCurrencyAmount(amount, originalCurrency, locale)}
        </AmountText>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end ${className}`}>
      <AmountText variant={variant}>
        {formatCurrencyAmount(
          displayAmount,
          isDifferentCurrency ? mainCurrency : originalCurrency,
          locale
        )}
      </AmountText>
      {isDifferentCurrency && showOriginal && (
        <AmountText variant="secondary">
          ≈ {formatCurrencyAmount(amount, originalCurrency, locale)}
        </AmountText>
      )}
    </div>
  );
}

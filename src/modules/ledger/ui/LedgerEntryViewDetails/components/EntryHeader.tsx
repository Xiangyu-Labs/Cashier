"use client";
import { ExpenseDeductionBadge } from "@/modules/currency/ui/ExpenseDeductionBadge";
import { EditableField } from "@/components/ui/editable-field";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/format/currency";
import { AmountText, amountTextClassName } from "@/modules/currency/ui/amount-text";
import { getCurrencyDecimals } from "@/lib/money/currency-precision";

interface EntryHeaderProps {
  itemName: string;
  amount: number;
  currency: string;
  preferredCurrencies: string[];
  /** Primary value on top: the main-currency amount once it is converted. */
  displayAmount: string;
  /** Currency of `displayAmount`; the entry's own until a conversion resolves. */
  displayCurrency: string;
  /** Stable flag for the two-line layout — the currency pair differs. */
  isDifferentCurrency: boolean;
  /** True once the conversion for the current draft has resolved. */
  showOriginalAmount: boolean;
  onFieldChange: (
    field: "itemName" | "amount" | "currency",
    value: string | number | undefined
  ) => void;
  disabled?: boolean;
}

export function EntryHeader({
  itemName,
  amount,
  currency,
  preferredCurrencies,
  displayAmount,
  displayCurrency,
  isDifferentCurrency,
  showOriginalAmount,
  onFieldChange,
  disabled = false,
}: EntryHeaderProps) {
  const locale = useLocale();
  const t = useTranslations("Calendar");
  const sortedCurrencies = [
    ...preferredCurrencies.filter((c) => c !== "unknown"),
    ...SUPPORTED_CURRENCIES.filter((c) => !preferredCurrencies.includes(c)),
  ];

  return (
    <div className="flex items-start gap-3">
      {/*
        The category already has its own labelled row in the metadata block
        below, so this slot keeps an icon-sized spacer instead of a second
        56px tile that repeats the same icon and name.
      */}
      <div className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" aria-hidden="true" />

      <div className="flex-1 space-y-1 sm:space-y-2 min-w-0 pr-8">
        <EditableField
          value={itemName}
          onChange={(v) => onFieldChange("itemName", v)}
          displayClassName="text-lg sm:text-xl font-semibold text-text break-words"
          inputClassName="font-semibold text-base sm:text-lg"
          disabled={disabled}
        />

        <ExpenseDeductionBadge amount={amount} />

        {/*
          Same reading order as the stream rows: the main-currency value on top,
          the original amount it came from underneath.
        */}
        <div className="mt-1 flex flex-col items-start">
          {(disabled || isDifferentCurrency) && (
            <AmountText variant="item">
              {formatCurrencyAmount(displayAmount, displayCurrency, locale)}
            </AmountText>
          )}

          {disabled ? (
            showOriginalAmount ? (
              <AmountText variant="secondary" className={cn(isDifferentCurrency && "mt-0.5")}>
                ≈ {formatCurrencyAmount(amount, currency, locale, { currencyDisplay: "code" })}
              </AmountText>
            ) : null
          ) : (
            <div
              className={cn(
                "flex items-baseline gap-1.5 sm:gap-2",
                isDifferentCurrency && "mt-0.5"
              )}
            >
              {showOriginalAmount && <AmountText variant="secondary">≈</AmountText>}
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <button
                    disabled={disabled}
                    aria-label={t("currency")}
                    className="text-base sm:text-lg font-normal text-muted-foreground hover:text-text transition-colors flex items-center gap-1 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {getCurrencySymbol(currency, locale)}
                    <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-28 p-1" align="start">
                  <div className="max-h-48 overflow-y-auto">
                    {sortedCurrencies.map((curr) => (
                      <button
                        key={curr}
                        onClick={() => onFieldChange("currency", curr)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors",
                          currency === curr && "bg-accent"
                        )}
                      >
                        {curr}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <CalculatorInput
                value={amount}
                onChange={(v) => onFieldChange("amount", v)}
                displayClassName={amountTextClassName(isDifferentCurrency ? "secondary" : "item")}
                disabled={disabled}
                allowNegative={amount < 0}
                preserveDirection
                maxDecimals={getCurrencyDecimals(currency)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

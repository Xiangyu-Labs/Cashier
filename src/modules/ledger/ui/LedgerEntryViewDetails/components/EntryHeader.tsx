import { type EntryCategory } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditableField } from "@/components/ui/editable-field";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

interface EntryHeaderProps {
  itemName: string;
  amount: number;
  currency: string;
  category?: EntryCategory;
  preferredCurrencies: string[];
  mainCurrency: string;
  convertedAmount: number;
  isDifferentCurrency: boolean;
  onFieldChange: (
    field: "itemName" | "amount" | "currency",
    value: string | number | undefined
  ) => void;
}

export function EntryHeader({
  itemName,
  amount,
  currency,
  category,
  preferredCurrencies,
  mainCurrency,
  convertedAmount,
  isDifferentCurrency,
  onFieldChange,
}: EntryHeaderProps) {
  const sortedCurrencies = [
    ...preferredCurrencies.filter((c) => c !== "unknown"),
    ...SUPPORTED_CURRENCIES.filter((c) => !preferredCurrencies.includes(c)),
  ];

  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
        <CategoryIcon iconName={category?.icon} className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
      </div>

      <div className="flex-1 space-y-1 sm:space-y-2 min-w-0 pr-8">
        <EditableField
          value={itemName}
          onChange={(v) => onFieldChange("itemName", v)}
          displayClassName="text-lg sm:text-xl font-semibold text-text break-words"
          inputClassName="font-semibold text-base sm:text-lg"
        />

        <div className="mt-1">
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <button className="text-base sm:text-lg font-normal text-muted-foreground hover:text-text transition-colors flex items-center gap-1">
                  {currency === "unknown" ? "?" : currency}
                  <ChevronDown className="h-3 w-3 opacity-50" />
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
              displayClassName="text-2xl sm:text-3xl font-bold text-primary font-mono"
            />
          </div>

          {isDifferentCurrency && (
            <p className="text-sm font-medium text-muted-foreground mt-0.5 opacity-80">
              ≈ {mainCurrency} {convertedAmount.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { ChevronDown, DollarSign, Loader2, Tag, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface LedgerEntriesActionsProps {
  categories: EntryCategory[];
  preferredCurrencies: string[];
  isProcessing: boolean;
  isAiCategorizing: boolean;
  isChangingCategory: boolean;
  isChangingCurrency: boolean;
  onAiCategorize: () => void;
  onChangeCategory: (categoryId: string | null) => void;
  onChangeCurrency: (currency: string) => void;
  showAiCategorize: boolean;
}

export function LedgerEntriesActions({
  categories,
  preferredCurrencies,
  isProcessing,
  isAiCategorizing,
  isChangingCategory,
  isChangingCurrency,
  onAiCategorize,
  onChangeCategory,
  onChangeCurrency,
  showAiCategorize,
}: LedgerEntriesActionsProps) {
  const t = useTranslations("BatchActions");

  const currencyList = [
    ...preferredCurrencies.filter((currency) =>
      SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])
    ),
    ...SUPPORTED_CURRENCIES.filter((currency) => !preferredCurrencies.includes(currency)),
  ];

  return (
    <>
      {showAiCategorize && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAiCategorize}
          disabled={isProcessing}
          className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
        >
          {isAiCategorizing ? (
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
          ) : (
            <Tags className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          )}
          <span className="hidden sm:inline">{t("aiCategorize")}</span>
          <span className="sm:hidden">{t("aiCategorizeShort")}</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
          >
            {isChangingCategory ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
            ) : (
              <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
            )}
            <span className="hidden sm:inline">{t("manualCategory")}</span>
            <span className="sm:hidden">{t("manualCategoryShort")}</span>
            <ChevronDown className="w-3 h-3 ml-0.5 sm:ml-1 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48 max-h-64 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => onChangeCategory(null)}
            className="text-muted-foreground"
          >
            <CategoryIcon iconName="CircleSlash" className="w-4 h-4 mr-2 opacity-50" />
            {t("uncategorized")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {categories.map((category) => (
            <DropdownMenuItem key={category.id} onClick={() => onChangeCategory(category.id)}>
              <CategoryIcon iconName={category.icon} className="w-4 h-4 mr-2" />
              {category.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
          >
            {isChangingCurrency ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
            ) : (
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
            )}
            <span className="hidden sm:inline">{t("setCurrency")}</span>
            <span className="sm:hidden">{t("setCurrencyShort")}</span>
            <ChevronDown className="w-3 h-3 ml-0.5 sm:ml-1 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-32 max-h-64 overflow-y-auto">
          {currencyList.map((currency) => (
            <DropdownMenuItem
              key={currency}
              onClick={() => onChangeCurrency(currency)}
              className={cn(preferredCurrencies.includes(currency) && "font-medium")}
            >
              {currency}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

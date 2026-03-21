/**
 * Ledger Entries Batch Actions
 *
 * Action buttons for batch operations on ledger entries:
 * - AI Categorize
 * - Change Category
 * - Change Currency
 */

import { Sparkles, Tag, ChevronDown, Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

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

  // Build currency list: preferred first, then others
  const currencyList = [
    ...preferredCurrencies.filter((c) =>
      SUPPORTED_CURRENCIES.includes(c as (typeof SUPPORTED_CURRENCIES)[number])
    ),
    ...SUPPORTED_CURRENCIES.filter((c) => !preferredCurrencies.includes(c)),
  ];

  return (
    <>
      {/* AI Auto Categorize - flex-1 (only shown when supported) */}
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
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          )}
          <span className="hidden sm:inline">{t("aiCategorize")}</span>
          <span className="sm:hidden">{t("aiCategorizeShort")}</span>
        </Button>
      )}

      {/* Category Dropdown - flex-1 */}
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

      {/* Currency Dropdown - flex-1 */}
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

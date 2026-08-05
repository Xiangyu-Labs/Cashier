import { Calendar, ChevronDown, DollarSign, Loader2, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BatchActionButton } from "@/components/batch-action-button";
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
  isChangingCategory: boolean;
  isChangingCurrency: boolean;
  onChangeCategory: (categoryId: string | null) => void;
  onChangeCurrency: (currency: string) => void;
  onChangeDate?: () => void;
  onDelete?: () => void;
}

export function LedgerEntriesActions({
  categories,
  preferredCurrencies,
  isProcessing,
  isChangingCategory,
  isChangingCurrency,
  onChangeCategory,
  onChangeCurrency,
  onChangeDate,
  onDelete,
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isProcessing} className="h-9 px-3 text-sm">
            {isChangingCategory ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Tag className="size-4" />
            )}
            <span className="hidden sm:inline">{t("manualCategory")}</span>
            <span className="sm:hidden">{t("manualCategoryShort")}</span>
            <ChevronDown className="size-3 opacity-50" />
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

      {onChangeDate != null && (
        <BatchActionButton
          variant="outline"
          icon={Calendar}
          disabled={isProcessing}
          onClick={onChangeDate}
        >
          {t("setDate")}
        </BatchActionButton>
      )}
      {onDelete != null && (
        <BatchActionButton
          variant="destructive"
          icon={Trash2}
          disabled={isProcessing}
          onClick={onDelete}
        >
          {t("delete")}
        </BatchActionButton>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isProcessing} className="h-9 px-3 text-sm">
            {isChangingCurrency ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <DollarSign className="size-4" />
            )}
            <span className="hidden sm:inline">{t("setCurrency")}</span>
            <span className="sm:hidden">{t("setCurrencyShort")}</span>
            <ChevronDown className="size-3 opacity-50" />
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

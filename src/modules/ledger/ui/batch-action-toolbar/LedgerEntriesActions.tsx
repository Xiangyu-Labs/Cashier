import { Calendar, ChevronDown, DollarSign, RefreshCw, Scissors, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BatchActionButton } from "@/components/batch-action-button";
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
  /** Every action is unavailable, either because a write is running or because
   * the selection is empty. */
  disabled: boolean;
  isChangingCategory?: boolean;
  isChangingCurrency?: boolean;
  isRetrying?: boolean;
  isDeleting?: boolean;
  onChangeCategory?: (categoryId: string | null) => void;
  onChangeCurrency?: (currency: string) => void;
  onChangeDate?: () => void;
  onRetry?: () => void;
  onSplit?: () => void;
  onDelete?: () => void;
}

/**
 * The batch action row, in one order everywhere: category, date, split, retry,
 * currency, delete. A surface renders only the actions its entities support, so
 * the subsets still line up — every view puts delete last.
 */
export function LedgerEntriesActions({
  categories,
  preferredCurrencies,
  disabled,
  isChangingCategory = false,
  isChangingCurrency = false,
  isRetrying = false,
  isDeleting = false,
  onChangeCategory,
  onChangeCurrency,
  onChangeDate,
  onRetry,
  onSplit,
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
      {onChangeCategory != null && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BatchActionButton
              icon={Tag}
              variant="outline"
              disabled={disabled}
              loading={isChangingCategory}
              shortLabel={t("manualCategoryShort")}
              trailing={<ChevronDown aria-hidden="true" className="opacity-50" />}
            >
              {t("manualCategory")}
            </BatchActionButton>
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
      )}

      {onChangeDate != null && (
        <BatchActionButton
          variant="outline"
          icon={Calendar}
          disabled={disabled}
          shortLabel={t("setDateShort")}
          onClick={onChangeDate}
        >
          {t("setDate")}
        </BatchActionButton>
      )}
      {onSplit != null && (
        <BatchActionButton variant="outline" icon={Scissors} disabled={disabled} onClick={onSplit}>
          {t("split")}
        </BatchActionButton>
      )}
      {onRetry != null && (
        <BatchActionButton
          variant="outline"
          icon={RefreshCw}
          disabled={disabled}
          loading={isRetrying}
          onClick={onRetry}
        >
          {t("retry")}
        </BatchActionButton>
      )}

      {onChangeCurrency != null && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BatchActionButton
              icon={DollarSign}
              variant="outline"
              disabled={disabled}
              loading={isChangingCurrency}
              shortLabel={t("setCurrencyShort")}
              trailing={<ChevronDown aria-hidden="true" className="opacity-50" />}
            >
              {t("setCurrency")}
            </BatchActionButton>
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
      )}

      {onDelete != null && (
        <BatchActionButton
          variant="destructive"
          icon={Trash2}
          disabled={disabled}
          loading={isDeleting}
          onClick={onDelete}
        >
          {t("delete")}
        </BatchActionButton>
      )}
    </>
  );
}

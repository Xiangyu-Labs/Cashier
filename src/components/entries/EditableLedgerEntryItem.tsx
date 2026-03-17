"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { type LedgerEntry, type EntryCategory } from "@/types/api";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useAmountDisplay } from "@/features/currency/client/hooks/use-amount-display";
import { parseAmount } from "@/lib/formatters";
import { EditableField } from "@/components/ui/editable-field";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { EditableCategorySelect } from "@/components/ui/editable-category-select";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EntryEditData } from "./entry-edit-data";

const itemVariants = cva("flex items-center py-2 px-3 rounded-lg transition-all", {
  variants: {
    variant: {
      default: "bg-surface hover:bg-surface2/50",
      warning: "bg-warning/5 border border-warning/20",
      error: "bg-destructive/5 border border-destructive/20",
      info: "bg-primary/5 border border-primary/20",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export { type EntryEditData };

export interface EditableLedgerEntryItemProps extends VariantProps<typeof itemVariants> {
  ledgerEntry: LedgerEntry;
  categories: EntryCategory[];
  categoryPlaceholder: string;
  preferredCurrencies?: string[];
  mainCurrency?: string;
  className?: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onChange?: (data: Partial<EntryEditData>) => void;
  pendingChanges?: Partial<EntryEditData>;
  /** The entryDate of the parent source document, used to detect date differences */
  sourceDocumentEntryDate?: string;
}

export const EditableLedgerEntryItem = memo(function EditableLedgerEntryItem({
  ledgerEntry,
  categories,
  categoryPlaceholder,
  preferredCurrencies = [],
  mainCurrency = "CNY",
  variant = "default",
  className,
  selected = false,
  onSelect,
  onChange,
  pendingChanges,
  sourceDocumentEntryDate,
}: EditableLedgerEntryItemProps) {
  const t = useTranslations("Calendar");

  // Merge pending changes with original data
  const displayData = {
    itemName: pendingChanges?.itemName ?? ledgerEntry.itemName,
    amount: pendingChanges?.amount ?? ledgerEntry.amount,
    currency: pendingChanges?.currency ?? ledgerEntry.currency,
    categoryId: pendingChanges?.categoryId ?? ledgerEntry.categoryId,
    description: pendingChanges?.description ?? ledgerEntry.description,
  };

  const { converted, isDifferentCurrency } = useAmountDisplay({
    amount: parseAmount(displayData.amount),
    currency: displayData.currency,
    mainCurrency,
    date: sourceDocumentEntryDate ?? ledgerEntry.createdAt,
  });

  const category = categories.find((c) => c.id === displayData.categoryId);

  const sortedCurrencies = (() => {
    const preferred = preferredCurrencies.filter((c) => c !== "unknown");
    const remaining = SUPPORTED_CURRENCIES.filter((c) => !preferred.includes(c));
    return [...preferred, ...remaining.sort()];
  })();

  const handleChange = (field: keyof EntryEditData, value: string | null) => {
    onChange?.({ [field]: value });
  };

  return (
    <div className={cn(itemVariants({ variant }), "gap-1.5 sm:gap-2", className)}>
      {/* Checkbox */}
      {onSelect && (
        <Checkbox checked={selected} onCheckedChange={onSelect} className="h-5 w-5 shrink-0" />
      )}

      {/* Category Icon */}
      <EditableCategorySelect
        value={displayData.categoryId}
        categories={categories}
        onChange={(categoryId) => handleChange("categoryId", categoryId)}
        placeholder={categoryPlaceholder}
      />

      {/* Name + Description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <EditableField
            value={displayData.itemName}
            onChange={(v) => handleChange("itemName", v)}
            placeholder={t("productName")}
            displayClassName="font-medium text-text text-sm"
            inputClassName="text-sm font-medium"
          />
        </div>

        {(displayData.description != null || category != null) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            {category != null && <span className="shrink-0">{category.name}</span>}
            {displayData.description != null && displayData.description !== "" && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <EditableField
                  value={displayData.description ?? ""}
                  onChange={(v) => handleChange("description", v !== "" ? v : null)}
                  placeholder={t("notes")}
                  displayClassName="truncate text-muted-foreground/60 text-[11px] italic"
                  inputClassName="text-[11px]"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Amount + Currency */}
      <div className="flex items-center gap-1 shrink-0">
        <Popover modal={true}>
          <PopoverTrigger asChild>
            <button className="text-xs text-muted-foreground hover:text-text transition-colors flex items-center gap-0.5">
              {displayData.currency ?? "?"}
              <ChevronDown className="h-2.5 w-2.5 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-24 p-1" align="end">
            <div className="max-h-48 overflow-y-auto">
              {sortedCurrencies.map((curr) => (
                <button
                  key={curr}
                  onClick={() => handleChange("currency", curr)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors",
                    displayData.currency === curr && "bg-accent"
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <CalculatorInput
          value={parseAmount(displayData.amount)}
          onChange={(v) => handleChange("amount", v.toFixed(2))}
          displayClassName="font-mono font-semibold text-sm text-text"
        />
      </div>

      {isDifferentCurrency && (
        <div className="text-[9px] text-muted-foreground font-mono opacity-60 shrink-0">
          ≈ {mainCurrency} {converted.toFixed(2)}
        </div>
      )}
    </div>
  );
});

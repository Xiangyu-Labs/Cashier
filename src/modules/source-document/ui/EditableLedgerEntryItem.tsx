"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { memo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useAmountDisplay } from "@/modules/currency/hooks/useAmountDisplay";
import { EditableCategorySelect } from "@/components/editable-category-select";
import { EditableField } from "@/components/ui/editable-field";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Button } from "@/components/ui/button";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { ChevronDown, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EntryEditData } from "@/modules/source-document/types";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/format/currency";
import { AmountText, amountTextClassName } from "@/modules/currency/ui/amount-text";

function parseAmount(amount: string | null | undefined): number {
  if (amount == null) return 0;
  const parsed = parseFloat(amount);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const itemVariants = cva(
  "flex items-center rounded-lg px-3 py-2 transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]",
  {
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
  }
);

export { type EntryEditData };

export interface EditableLedgerEntryItemProps extends VariantProps<typeof itemVariants> {
  ledgerEntry: LedgerEntry;
  categories: EntryCategory[];
  categoryPlaceholder: string;
  preferredCurrencies?: string[];
  mainCurrency?: string;
  className?: string;
  onChange?: (data: Partial<EntryEditData>) => void;
  pendingChanges?: Partial<EntryEditData>;
  /** The (possibly pending-edited) entryDate of the parent source document, used to detect date differences */
  sourceDocumentEntryDate?: string;
  /**
   * The parent source document's persisted entryDate. `ledgerEntry` here is
   * always the embedded, sourceDocument-less DTO
   * (`LedgerEntryEmbeddedViewDto`), so this must be passed explicitly rather
   * than read off `ledgerEntry.sourceDocument?.entryDate` — that field is
   * structurally never present on this DTO and would silently read as "".
   */
  originalEntryDate: string;
  readOnly?: boolean;
  /** When provided, a delete affordance is shown for this entry (edit mode only). */
  onDelete?: (() => void) | undefined;
}

export const EditableLedgerEntryItem = memo(function EditableLedgerEntryItem({
  ledgerEntry,
  categories,
  categoryPlaceholder,
  preferredCurrencies = [],
  mainCurrency = "CNY",
  variant = "default",
  className,
  onChange,
  pendingChanges,
  sourceDocumentEntryDate,
  originalEntryDate,
  readOnly = false,
  onDelete,
}: EditableLedgerEntryItemProps) {
  const t = useTranslations("Calendar");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  // Merge pending changes with original data
  const displayData = {
    itemName: pendingChanges?.itemName ?? ledgerEntry.itemName,
    amount: pendingChanges?.amount ?? ledgerEntry.amount,
    currency: pendingChanges?.currency ?? ledgerEntry.currency,
    categoryId: pendingChanges?.categoryId ?? ledgerEntry.categoryId,
    description: pendingChanges?.description ?? ledgerEntry.description,
  };

  // Only convert live while amount, currency, or the source-document date has
  // unsaved changes; otherwise the persisted accounting value is authoritative.
  const hasPendingValueChanges =
    pendingChanges?.amount !== undefined || pendingChanges?.currency !== undefined;
  const dateHasPendingChange =
    sourceDocumentEntryDate != null &&
    sourceDocumentEntryDate !== "" &&
    sourceDocumentEntryDate !== originalEntryDate;
  const persistedConvertedAmount =
    !hasPendingValueChanges && !dateHasPendingChange ? ledgerEntry.convertedAmount : null;

  const { converted, isDifferentCurrency, status } = useAmountDisplay({
    ledgerId: ledgerEntry.ledgerId,
    amount:
      pendingChanges?.amount !== undefined ? String(pendingChanges.amount) : ledgerEntry.amount,
    currency: displayData.currency,
    mainCurrency,
    date: sourceDocumentEntryDate ?? ledgerEntry.createdAt,
    persistedConvertedAmount,
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
      {/* Category Icon */}
      <EditableCategorySelect
        value={displayData.categoryId}
        categories={categories}
        onChange={(categoryId) => handleChange("categoryId", categoryId)}
        placeholder={categoryPlaceholder}
        disabled={readOnly}
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
            disabled={readOnly}
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
                  disabled={readOnly}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Amount + Currency */}
      <div className="flex items-center gap-1 shrink-0">
        <Popover modal={true} {...(readOnly ? { open: false } : {})}>
          <PopoverTrigger asChild>
            <button
              disabled={readOnly}
              className="text-xs text-muted-foreground hover:text-text transition-colors flex items-center gap-0.5 disabled:cursor-default"
            >
              {getCurrencySymbol(displayData.currency ?? "unknown", locale)}
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
          displayClassName={amountTextClassName("item")}
          disabled={readOnly}
        />
      </div>

      {isDifferentCurrency && status === "success" && converted != null && (
        <AmountText variant="secondary" className="shrink-0">
          ≈ {formatCurrencyAmount(converted, mainCurrency, locale)}
        </AmountText>
      )}

      {!readOnly && onDelete != null && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          onClick={onDelete}
          aria-label={tCommon("delete")}
          title={tCommon("delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
});

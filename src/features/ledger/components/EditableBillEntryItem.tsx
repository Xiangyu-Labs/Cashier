"use client";

import { memo, useState, useMemo } from "react";
import { useLocale } from "next-intl";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useConvertedAmount } from "@/features/currency/client/hooks/useConvertedAmount";
import { EditableField } from "@/components/ui/editable-field";
import { EditableCategorySelect } from "@/components/ui/editable-category-select";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const itemVariants = cva(
    "flex items-center py-2 px-3 rounded-lg transition-all",
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

export interface EntryEditData {
    itemName: string;
    amount: string;
    currency: string;
    categoryId: string | null;
    description: string | null;
}

export interface EditableBillEntryItemProps extends VariantProps<typeof itemVariants> {
    ledgerEntry: LedgerEntry;
    categories: EntryCategory[];
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

export const EditableBillEntryItem = memo(function EditableBillEntryItem({
    ledgerEntry,
    categories,
    preferredCurrencies = [],
    mainCurrency = "CNY",
    variant = "default",
    className,
    selected = false,
    onSelect,
    onChange,
    pendingChanges,
    sourceDocumentEntryDate,
}: EditableBillEntryItemProps) {
    const locale = useLocale();
    // Merge pending changes with original data
    const displayData = {
        itemName: pendingChanges?.itemName ?? ledgerEntry.itemName,
        amount: pendingChanges?.amount ?? ledgerEntry.amount,
        currency: pendingChanges?.currency ?? ledgerEntry.currency,
        categoryId: pendingChanges?.categoryId ?? ledgerEntry.categoryId,
        description: pendingChanges?.description ?? ledgerEntry.description,
    };

    const { converted } = useConvertedAmount(
        parseFloat(displayData.amount),
        displayData.currency,
        mainCurrency,
        sourceDocumentEntryDate || ledgerEntry.createdAt
    );

    const isDifferentCurrency =
        displayData.currency &&
        displayData.currency !== mainCurrency &&
        displayData.currency !== "unknown";

    const category = categories.find(c => c.id === displayData.categoryId);

    const sortedCurrencies = (() => {
        const preferred = preferredCurrencies.filter(c => c !== "unknown");
        const remaining = SUPPORTED_CURRENCIES.filter(c => !preferred.includes(c));
        return [...preferred, ...remaining.sort()];
    })();

    const handleChange = (field: keyof EntryEditData, value: string | null) => {
        onChange?.({ [field]: value });
    };

    return (
        <div className={cn(itemVariants({ variant }), "gap-1.5 sm:gap-2", className)}>
            {/* Checkbox */}
            {onSelect && (
                <Checkbox
                    checked={selected}
                    onCheckedChange={onSelect}
                    className="h-4 w-4 shrink-0"
                />
            )}

            {/* Category Icon */}
            <EditableCategorySelect
                value={displayData.categoryId}
                categories={categories}
                onChange={(categoryId) => handleChange("categoryId", categoryId)}
            />

            {/* Name + Description */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <EditableField
                        value={displayData.itemName}
                        onChange={(v) => handleChange("itemName", v)}
                        placeholder="商品名称"
                        displayClassName="font-medium text-text text-sm"
                        inputClassName="text-sm font-medium"
                    />
                </div>

                {(displayData.description || category) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        {category && <span className="shrink-0">{category.name}</span>}
                        {displayData.description && (
                            <>
                                <span className="text-muted-foreground/30">·</span>
                                <EditableField
                                    value={displayData.description || ""}
                                    onChange={(v) => handleChange("description", v || null)}
                                    placeholder="备注"
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
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="text-xs text-muted-foreground hover:text-text transition-colors flex items-center gap-0.5">
                            {displayData.currency || "?"}
                            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-24 p-1" align="end">
                        <div className="max-h-48 overflow-y-auto">
                            {sortedCurrencies.map(curr => (
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

                <EditableField
                    value={parseFloat(displayData.amount).toFixed(2)}
                    onChange={(v) => handleChange("amount", v)}
                    type="number"
                    displayClassName="font-mono font-semibold text-sm text-text"
                    inputClassName="w-20 text-right font-mono font-semibold text-sm"
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

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Trash2, ChevronDown, Loader2, Tag, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EntryCategory } from "@/types/api";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

interface BatchActionToolbarProps {
    selectedCount: number;
    totalCount: number;
    isAllSelected: boolean;
    hasMoreData?: boolean;
    onSelectAll: () => void;
    onClearSelection: () => void;
    onAiCategorize: () => void;
    onChangeCategory: (categoryId: string | null) => void;
    onChangeCurrency: (currency: string) => void;
    onDelete: () => void;
    categories: EntryCategory[];
    preferredCurrencies?: string[];
    // Optional loading states from mutations
    isAiCategorizing?: boolean;
    isChangingCategory?: boolean;
    isChangingCurrency?: boolean;
    isDeleting?: boolean;
}

export function BatchActionToolbar({
    selectedCount,
    totalCount,
    isAllSelected,
    hasMoreData = false,
    onSelectAll,
    onClearSelection,
    onAiCategorize,
    onChangeCategory,
    onChangeCurrency,
    onDelete,
    categories,
    preferredCurrencies = [],
    isAiCategorizing: isAiCategorizingProp,
    isChangingCategory: isChangingCategoryProp,
    isChangingCurrency: isChangingCurrencyProp,
    isDeleting: isDeletingProp,
}: BatchActionToolbarProps) {
    const t = useTranslations("BatchActions");
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // Use provided loading states or fall back to internal state management
    const [internalAiCategorizing, setInternalAiCategorizing] = useState(false);
    const [internalDeleting, setInternalDeleting] = useState(false);
    const [internalChangingCategory, setInternalChangingCategory] = useState(false);
    const [internalChangingCurrency, setInternalChangingCurrency] = useState(false);

    const isAiCategorizing = isAiCategorizingProp ?? internalAiCategorizing;
    const isDeleting = isDeletingProp ?? internalDeleting;
    const isChangingCategory = isChangingCategoryProp ?? internalChangingCategory;
    const isChangingCurrency = isChangingCurrencyProp ?? internalChangingCurrency;

    const handleAiCategorize = async () => {
        if (isAiCategorizingProp === undefined) {
            setInternalAiCategorizing(true);
            try {
                await onAiCategorize();
            } finally {
                setInternalAiCategorizing(false);
            }
        } else {
            onAiCategorize();
        }
    };

    const handleDelete = async () => {
        if (isDeletingProp === undefined) {
            setInternalDeleting(true);
            try {
                await onDelete();
            } finally {
                setInternalDeleting(false);
                setDeleteConfirmOpen(false);
            }
        } else {
            onDelete();
            setDeleteConfirmOpen(false);
        }
    };

    const handleChangeCategory = async (categoryId: string | null) => {
        if (isChangingCategoryProp === undefined) {
            setInternalChangingCategory(true);
            try {
                await onChangeCategory(categoryId);
            } finally {
                setInternalChangingCategory(false);
            }
        } else {
            onChangeCategory(categoryId);
        }
    };

    const handleChangeCurrency = async (currency: string) => {
        if (isChangingCurrencyProp === undefined) {
            setInternalChangingCurrency(true);
            try {
                await onChangeCurrency(currency);
            } finally {
                setInternalChangingCurrency(false);
            }
        } else {
            onChangeCurrency(currency);
        }
    };

    const isProcessing = isAiCategorizing || isDeleting || isChangingCategory || isChangingCurrency;

    // Build currency list: preferred first, then others
    const currencyList = [
        ...preferredCurrencies.filter(c => SUPPORTED_CURRENCIES.includes(c as typeof SUPPORTED_CURRENCIES[number])),
        ...SUPPORTED_CURRENCIES.filter(c => !preferredCurrencies.includes(c))
    ];

    return (
        <>
            <AnimatePresence>
                {selectedCount > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
                    >
                        <div className="max-w-lg mx-auto pointer-events-auto">
                            <div className="bg-surface border border-border rounded-xl shadow-lg p-2 sm:p-3">
                                {/* Top row: selection info */}
                                <div className="flex items-center justify-between mb-2 sm:mb-3">
                                    <div className="flex flex-col">
                                        <span className="text-xs sm:text-sm font-medium">
                                            {t("selected", { count: selectedCount })}
                                        </span>
                                        {isAllSelected && hasMoreData && (
                                            <span className="text-[10px] text-muted-foreground">
                                                {t("loadedOnly")}
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={isAllSelected ? onClearSelection : onSelectAll}
                                        className="text-xs h-7 px-2"
                                    >
                                        {isAllSelected ? t("deselectAll") : t("selectAll")}
                                        {!isAllSelected && (
                                            <span className="ml-1 text-muted-foreground">
                                                ({totalCount})
                                            </span>
                                        )}
                                    </Button>
                                </div>

                                {/* Bottom row: action buttons */}
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    {/* AI Auto Categorize */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleAiCategorize}
                                        disabled={isProcessing}
                                        className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                                    >
                                        {isAiCategorizing ? (
                                            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
                                        ) : (
                                            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                                        )}
                                        {t("aiCategorize")}
                                    </Button>

                                    {/* Manual Category Selection Dropdown */}
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
                                                {t("manualCategory")}
                                                <ChevronDown className="w-3 h-3 ml-0.5 sm:ml-1 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48 max-h-64 overflow-y-auto">
                                            <DropdownMenuItem
                                                onClick={() => handleChangeCategory(null)}
                                                className="text-muted-foreground"
                                            >
                                                <CategoryIcon iconName="CircleSlash" className="w-4 h-4 mr-2 opacity-50" />
                                                {t("uncategorized")}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {categories.map((category) => (
                                                <DropdownMenuItem
                                                    key={category.id}
                                                    onClick={() => handleChangeCategory(category.id)}
                                                >
                                                    <CategoryIcon iconName={category.icon} className="w-4 h-4 mr-2" />
                                                    {category.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* Currency Selection Dropdown */}
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
                                                {t("setCurrency")}
                                                <ChevronDown className="w-3 h-3 ml-0.5 sm:ml-1 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-32 max-h-64 overflow-y-auto">
                                            {currencyList.map((currency) => (
                                                <DropdownMenuItem
                                                    key={currency}
                                                    onClick={() => handleChangeCurrency(currency)}
                                                    className={cn(
                                                        preferredCurrencies.includes(currency) && "font-medium"
                                                    )}
                                                >
                                                    {currency}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* Delete */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeleteConfirmOpen(true)}
                                        disabled={isProcessing}
                                        className={cn(
                                            "h-8 sm:h-9 px-2 sm:px-3",
                                            "text-destructive hover:text-destructive hover:bg-destructive/10",
                                            "border-destructive/30"
                                        )}
                                    >
                                        {isDeleting ? (
                                            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title={t("deleteConfirmTitle", { count: selectedCount })}
                description={t("deleteConfirmDesc")}
                onConfirm={handleDelete}
                variant="destructive"
                confirmLabel={t("delete")}
            />
        </>
    );
}

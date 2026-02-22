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
    onAiCategorize?: () => void;  // Optional - not all contexts support AI categorization
    onChangeCategory: (categoryId: string | null) => void;
    onChangeCurrency: (currency: string) => void;
    onDelete?: () => void;  // Optional - not all contexts support batch delete
    categories: EntryCategory[];
    preferredCurrencies?: string[];
    // Optional loading states from mutations
    isAiCategorizing?: boolean;
    isChangingCategory?: boolean;
    isChangingCurrency?: boolean;
    isDeleting?: boolean;
    // Layout variant
    variant?: "fixed" | "inline";  // "fixed" for full-screen, "inline" for modal/container
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
    variant = "fixed",
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
        if (!onAiCategorize) return;

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
        if (!onDelete) return;

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

    // Determine if AI categorize should be shown
    const showAiCategorize = onAiCategorize !== undefined;
    // Determine if delete should be shown
    const showDelete = onDelete !== undefined;

    // Build currency list: preferred first, then others
    const currencyList = [
        ...preferredCurrencies.filter(c => SUPPORTED_CURRENCIES.includes(c as typeof SUPPORTED_CURRENCIES[number])),
        ...SUPPORTED_CURRENCIES.filter(c => !preferredCurrencies.includes(c))
    ];

    // Container classes based on variant
    const containerClasses = variant === "fixed"
        ? "fixed bottom-0 left-0 right-0 z-50 px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
        : "shrink-0 pointer-events-auto";

    const innerWrapperClasses = variant === "fixed"
        ? "max-w-lg mx-auto pointer-events-auto"
        : "";

    return (
        <>
            <AnimatePresence>
                {selectedCount > 0 && (
                    <motion.div
                        initial={variant === "fixed" ? { y: 100, opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={variant === "fixed" ? { y: 0, opacity: 1 } : { height: "auto", opacity: 1 }}
                        exit={variant === "fixed" ? { y: 100, opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className={containerClasses}
                    >
                        <div className={cn(innerWrapperClasses, variant === "inline" && "border-t bg-surface/95")}>
                            <div className={cn(
                                "border border-border shadow-lg p-2 sm:p-3 bg-surface2",
                                variant === "fixed" && "rounded-xl",
                                variant === "inline" && "border-x-0 border-b-0"
                            )}>
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
                                <div className="flex items-center gap-1 sm:gap-2">
                                    {/* AI Auto Categorize - flex-1 (only shown when supported) */}
                                    {showAiCategorize && (
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

                                    {/* Delete - fixed width (only shown when supported) */}
                                    {showDelete && (
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
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showDelete && (
                <ConfirmDialog
                    open={deleteConfirmOpen}
                    onOpenChange={setDeleteConfirmOpen}
                    title={t("deleteConfirmTitle", { count: selectedCount })}
                    description={t("deleteConfirmDesc")}
                    onConfirm={handleDelete}
                    variant="destructive"
                    confirmLabel={t("delete")}
                />
            )}
        </>
    );
}

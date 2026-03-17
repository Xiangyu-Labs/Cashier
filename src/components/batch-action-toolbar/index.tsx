"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type EntryCategory } from "@/types/api";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useBatchActions } from "./use-batch-actions";
import { LedgerEntriesActions } from "./ledger-entries-actions";
import { SourceDocumentActions } from "./source-document-actions";

export interface BatchActionToolbarProps {
    selectedCount: number;
    totalCount: number;
    isAllSelected: boolean;
    hasMoreData?: boolean;
    onSelectAll: () => void;
    onClearSelection: () => void;
    // Ledger Entry actions
    onAiCategorize?: () => void;
    onChangeCategory?: (categoryId: string | null) => void;
    onChangeCurrency?: (currency: string) => void;
    onDelete?: () => void;
    // Source Document actions
    onUpdateDates?: (date: string) => void;
    onRetry?: () => void;
    // Data
    categories?: EntryCategory[];
    preferredCurrencies?: string[];
    // Optional loading states from mutations
    isAiCategorizing?: boolean;
    isChangingCategory?: boolean;
    isChangingCurrency?: boolean;
    isDeleting?: boolean;
    isUpdatingDates?: boolean;
    isRetrying?: boolean;
    // Layout variant
    variant?: "fixed" | "inline";
    // Mode
    mode?: "ledgerEntries" | "sourceDocuments";
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
    onUpdateDates,
    onRetry,
    categories = [],
    preferredCurrencies = [],
    isAiCategorizing: isAiCategorizingProp,
    isChangingCategory: isChangingCategoryProp,
    isChangingCurrency: isChangingCurrencyProp,
    isDeleting: isDeletingProp,
    isUpdatingDates: isUpdatingDatesProp,
    isRetrying: isRetryingProp,
    variant = "fixed",
    mode = "ledgerEntries",
}: BatchActionToolbarProps) {
    const t = useTranslations("BatchActions");

    const {
        isAiCategorizing,
        isChangingCategory,
        isChangingCurrency,
        isDeleting,
        isUpdatingDates,
        isRetrying,
        isProcessing,
        deleteConfirmOpen,
        setDeleteConfirmOpen,
        datePickerOpen,
        setDatePickerOpen,
        selectedDate,
        setSelectedDate,
        handleAiCategorize,
        handleChangeCategory,
        handleChangeCurrency,
        handleDelete,
        handleUpdateDates,
        handleRetry,
    } = useBatchActions({
        onAiCategorize,
        onChangeCategory,
        onChangeCurrency,
        onDelete,
        onUpdateDates,
        onRetry,
        isAiCategorizingProp,
        isChangingCategoryProp,
        isChangingCurrencyProp,
        isDeletingProp,
        isUpdatingDatesProp,
        isRetryingProp,
    });

    // Determine if AI categorize should be shown
    const showAiCategorize = onAiCategorize !== undefined && mode === "ledgerEntries";
    // Determine if delete should be shown
    const showDelete = onDelete !== undefined;

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
                                    {mode === "ledgerEntries" ? (
                                        <LedgerEntriesActions
                                            categories={categories}
                                            preferredCurrencies={preferredCurrencies}
                                            isProcessing={isProcessing}
                                            isAiCategorizing={isAiCategorizing}
                                            isChangingCategory={isChangingCategory}
                                            isChangingCurrency={isChangingCurrency}
                                            onAiCategorize={handleAiCategorize}
                                            onChangeCategory={handleChangeCategory}
                                            onChangeCurrency={handleChangeCurrency}
                                            showAiCategorize={showAiCategorize}
                                        />
                                    ) : (
                                        <SourceDocumentActions
                                            isProcessing={isProcessing}
                                            isUpdatingDates={isUpdatingDates}
                                            isRetrying={isRetrying}
                                            onUpdateDates={handleUpdateDates}
                                            onRetry={handleRetry}
                                            onCancel={() => setDatePickerOpen(false)}
                                            datePickerOpen={datePickerOpen}
                                            setDatePickerOpen={setDatePickerOpen}
                                            selectedDate={selectedDate}
                                            setSelectedDate={setSelectedDate}
                                            showUpdateDates={!!onUpdateDates}
                                            showRetry={!!onRetry}
                                        />
                                    )}

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

export { useBatchActions } from "./use-batch-actions";

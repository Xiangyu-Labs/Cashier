"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { LedgerEntriesActions } from "./LedgerEntriesActions";

export interface LedgerEntriesBatchActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  hasMoreData?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChangeCategory?: (categoryId: string | null) => Promise<void> | void;
  onChangeCurrency?: (currency: string) => Promise<void> | void;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  isChangingCategory?: boolean;
  isChangingCurrency?: boolean;
  onChangeDate?: () => void;
  onDelete?: () => void;
  isProcessing?: boolean;
  variant?: "fixed" | "inline";
}

export function LedgerEntriesBatchActionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  hasMoreData = false,
  onSelectAll,
  onClearSelection,
  onChangeCategory,
  onChangeCurrency,
  categories = [],
  preferredCurrencies = [],
  isChangingCategory: isChangingCategoryProp,
  isChangingCurrency: isChangingCurrencyProp,
  onChangeDate,
  onDelete,
  isProcessing: externallyProcessing = false,
  variant = "fixed",
}: LedgerEntriesBatchActionToolbarProps) {
  const t = useTranslations("BatchActions");
  const [internalChangingCategory, setInternalChangingCategory] = useState(false);
  const [internalChangingCurrency, setInternalChangingCurrency] = useState(false);

  const isChangingCategory = isChangingCategoryProp ?? internalChangingCategory;
  const isChangingCurrency = isChangingCurrencyProp ?? internalChangingCurrency;
  const isProcessing = isChangingCategory || isChangingCurrency || externallyProcessing;

  const handleChangeCategory = useCallback(
    async (categoryId: string | null) => {
      if (!onChangeCategory) return;

      if (isChangingCategoryProp === undefined) {
        setInternalChangingCategory(true);
        try {
          await onChangeCategory(categoryId);
        } finally {
          setInternalChangingCategory(false);
        }
        return;
      }

      await onChangeCategory(categoryId);
    },
    [isChangingCategoryProp, onChangeCategory]
  );

  const handleChangeCurrency = useCallback(
    async (currency: string) => {
      if (!onChangeCurrency) return;

      if (isChangingCurrencyProp === undefined) {
        setInternalChangingCurrency(true);
        try {
          await onChangeCurrency(currency);
        } finally {
          setInternalChangingCurrency(false);
        }
        return;
      }

      await onChangeCurrency(currency);
    },
    [isChangingCurrencyProp, onChangeCurrency]
  );

  const containerClasses =
    variant === "fixed"
      ? "fixed bottom-0 left-0 right-0 z-action-bar px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
      : "shrink-0 pointer-events-auto";
  const innerWrapperClasses = variant === "fixed" ? "max-w-lg mx-auto pointer-events-auto" : "";

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
            <div
              className={cn(innerWrapperClasses, variant === "inline" && "border-t bg-surface/95")}
            >
              <div
                className={cn(
                  "border border-border shadow-lg p-2 sm:p-3 bg-surface2",
                  variant === "fixed" && "rounded-xl",
                  variant === "inline" && "border-x-0 border-b-0"
                )}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-sm font-medium">
                      {t("selected", { count: selectedCount })}
                    </span>
                    {isAllSelected && hasMoreData && (
                      <span className="text-[10px] text-muted-foreground">{t("loadedOnly")}</span>
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
                      <span className="ml-1 text-muted-foreground">({totalCount})</span>
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  <LedgerEntriesActions
                    categories={categories}
                    preferredCurrencies={preferredCurrencies}
                    isProcessing={isProcessing}
                    isChangingCategory={isChangingCategory}
                    isChangingCurrency={isChangingCurrency}
                    onChangeCategory={handleChangeCategory}
                    onChangeCurrency={handleChangeCurrency}
                    {...(onChangeDate != null ? { onChangeDate } : {})}
                    {...(onDelete != null ? { onDelete } : {})}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

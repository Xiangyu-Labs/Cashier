"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  onAiCategorize?: () => Promise<void> | void;
  onChangeCategory?: (categoryId: string | null) => Promise<void> | void;
  onChangeCurrency?: (currency: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  categories?: EntryCategory[];
  preferredCurrencies?: string[];
  isAiCategorizing?: boolean;
  isChangingCategory?: boolean;
  isChangingCurrency?: boolean;
  isDeleting?: boolean;
  variant?: "fixed" | "inline";
}

export function LedgerEntriesBatchActionToolbar({
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
  categories = [],
  preferredCurrencies = [],
  isAiCategorizing: isAiCategorizingProp,
  isChangingCategory: isChangingCategoryProp,
  isChangingCurrency: isChangingCurrencyProp,
  isDeleting: isDeletingProp,
  variant = "fixed",
}: LedgerEntriesBatchActionToolbarProps) {
  const t = useTranslations("BatchActions");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [internalAiCategorizing, setInternalAiCategorizing] = useState(false);
  const [internalChangingCategory, setInternalChangingCategory] = useState(false);
  const [internalChangingCurrency, setInternalChangingCurrency] = useState(false);
  const [internalDeleting, setInternalDeleting] = useState(false);

  const isAiCategorizing = isAiCategorizingProp ?? internalAiCategorizing;
  const isChangingCategory = isChangingCategoryProp ?? internalChangingCategory;
  const isChangingCurrency = isChangingCurrencyProp ?? internalChangingCurrency;
  const isDeleting = isDeletingProp ?? internalDeleting;
  const isProcessing = isAiCategorizing || isChangingCategory || isChangingCurrency || isDeleting;

  const handleAiCategorize = useCallback(async () => {
    if (!onAiCategorize) return;

    if (isAiCategorizingProp === undefined) {
      setInternalAiCategorizing(true);
      try {
        await onAiCategorize();
      } finally {
        setInternalAiCategorizing(false);
      }
      return;
    }

    await onAiCategorize();
  }, [isAiCategorizingProp, onAiCategorize]);

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

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    if (isDeletingProp === undefined) {
      setInternalDeleting(true);
      try {
        await onDelete();
      } finally {
        setInternalDeleting(false);
        setDeleteConfirmOpen(false);
      }
      return;
    }

    await onDelete();
    setDeleteConfirmOpen(false);
  }, [isDeletingProp, onDelete]);

  const containerClasses =
    variant === "fixed"
      ? "fixed bottom-0 left-0 right-0 z-action-bar px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
      : "shrink-0 pointer-events-auto";
  const innerWrapperClasses = variant === "fixed" ? "max-w-lg mx-auto pointer-events-auto" : "";
  const showDelete = onDelete !== undefined;

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
                    isAiCategorizing={isAiCategorizing}
                    isChangingCategory={isChangingCategory}
                    isChangingCurrency={isChangingCurrency}
                    onAiCategorize={handleAiCategorize}
                    onChangeCategory={handleChangeCategory}
                    onChangeCurrency={handleChangeCurrency}
                    showAiCategorize={onAiCategorize !== undefined}
                  />

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

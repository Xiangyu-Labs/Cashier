"use client";

import { Button } from "@/components/ui/button";
import { type LedgerEntry, type EntryCategory } from "@/types/api";
import { ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { type ReactNode, useCallback, useMemo, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { useConvertedAmount } from "@/features/currency/client/hooks/use-converted-amount";
import { AnimatePresence, motion } from "framer-motion";
import { EditableField } from "@/components/ui/editable-field";
import { EditableCategorySelect } from "@/components/ui/editable-category-select";
import { EntryHeader } from "./components/EntryHeader";
import { EntryActions } from "./components/EntryActions";
import { useTextFolding } from "./hooks/useTextFolding";

// Types for pending changes
export interface EntryPendingChanges {
  itemName?: string;
  amount?: number;
  currency?: string;
  categoryId?: string | null;
  description?: string | null;
}

interface LedgerEntryViewDetailsProps {
  ledgerEntry: LedgerEntry;
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  pendingChanges: EntryPendingChanges;
  onFieldChange: (changes: EntryPendingChanges) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  onViewSourceDocument?: () => void;
}

export const LedgerEntryViewDetails = memo(function LedgerEntryViewDetails({
  ledgerEntry,
  categories,
  preferredCurrencies = [],
  mainCurrency = "CNY",
  pendingChanges,
  onFieldChange,
  onSave,
  onDiscard,
  onDelete,
  onViewSourceDocument,
}: LedgerEntryViewDetailsProps): ReactNode {
  const t = useTranslations("LedgerEntryDetail");
  const locale = useLocale();

  // Merge pending changes with original data
  const displayData = useMemo(
    () => ({
      itemName: pendingChanges.itemName ?? ledgerEntry.itemName,
      amount: pendingChanges.amount ?? parseFloat(ledgerEntry.amount),
      currency: pendingChanges.currency ?? ledgerEntry.currency ?? mainCurrency,
      categoryId:
        pendingChanges.categoryId !== undefined
          ? pendingChanges.categoryId
          : ledgerEntry.categoryId,
      description:
        pendingChanges.description !== undefined
          ? pendingChanges.description
          : ledgerEntry.description,
    }),
    [pendingChanges, ledgerEntry, mainCurrency]
  );

  // Get entryDate from source document
  const entryDate =
    ledgerEntry.sourceDocument?.entryDate ??
    (ledgerEntry.createdAt !== undefined ? formatDateTimeForApi(new Date(ledgerEntry.createdAt)) : "");

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const { converted } = useConvertedAmount(
    displayData.amount,
    displayData.currency,
    mainCurrency,
    entryDate != null && entryDate !== "" ? entryDate : ledgerEntry.createdAt
  );

  const isDifferentCurrency = Boolean(
    displayData.currency !== "" && displayData.currency !== null && displayData.currency !== undefined &&
    displayData.currency !== mainCurrency &&
    displayData.currency !== "unknown"
  );

  const { isExpanded, setIsExpanded, needsFolding, contentRef } = useTextFolding([
    displayData.description,
  ]);

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(locale);
  };

  const handleFieldChange = useCallback(
    <K extends keyof EntryPendingChanges>(field: K, value: EntryPendingChanges[K]) => {
      onFieldChange({ [field]: value });
    },
    [onFieldChange]
  );

  const category = categories.find((c) => c.id === displayData.categoryId);

  return (
    <div className="flex flex-col h-full max-h-[inherit]">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 subtle-scrollbar">
        {/* Header Info */}
        <EntryHeader
          itemName={displayData.itemName}
          amount={displayData.amount}
          currency={displayData.currency}
          category={category}
          preferredCurrencies={preferredCurrencies}
          mainCurrency={mainCurrency}
          convertedAmount={converted}
          isDifferentCurrency={isDifferentCurrency}
          onFieldChange={handleFieldChange}
        />

        {/* Details Grid */}
        <div className="rounded-lg border border-border bg-surface2/30 p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Date and Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Date - Read-only, from source document */}
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground shrink-0">{t("entryDate")}:</span>
              <span className="text-sm text-text">
                {entryDate != null && entryDate !== ""
                  ? parseDateString(entryDate).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "-"}
              </span>
            </div>

            {/* Category - Editable */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground shrink-0">{t("category")}:</span>
              <EditableCategorySelect
                value={displayData.categoryId}
                categories={categories}
                onChange={(categoryId) => handleFieldChange("categoryId", categoryId)}
                placeholder={t("selectCategory")}
              />
            </div>
          </div>

          {/* Description - Editable */}
          <div className="border-t border-border/50 pt-4 mt-2">
            <EditableField
              value={displayData.description ?? ""}
              onChange={(v) => handleFieldChange("description", v != null && v !== "" ? v : null)}
              type="textarea"
              placeholder={t("addDescription")}
              displayClassName="text-sm text-text"
              inputClassName="text-sm"
              renderDisplay={(value: string) => {
                const hasValue = value.length > 0;
                return hasValue ? (
                  <div className="text-sm text-text">
                    <AnimatePresence initial={false}>
                      <motion.div
                        ref={contentRef}
                        initial={false}
                        className={`break-words whitespace-pre-wrap ${!isExpanded ? "line-clamp-3" : ""}`}
                      >
                        {value}
                      </motion.div>
                    </AnimatePresence>
                    {needsFolding === true && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsExpanded(!isExpanded);
                        }}
                        className="h-6 px-0 text-primary hover:text-primary/80 mt-1"
                      >
                        {isExpanded ? (
                          <>
                            {t("collapse")} <ChevronUp className="h-3 w-3 ml-1" />
                          </>
                        ) : (
                          <>
                            {t("expand")} <ChevronDown className="h-3 w-3 ml-1" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground/50 italic">
                    {t("noDescription")}
                  </span>
                );
              }}
            />
          </div>

          {/* Created At */}
          <div className="flex justify-between items-center border-t border-border/50 pt-4">
            <span className="text-sm text-muted-foreground">{t("createdAt")}</span>
            <span className="text-sm text-text">{formatDateTime(ledgerEntry.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <EntryActions
        hasPendingChanges={hasPendingChanges}
        onViewSourceDocument={onViewSourceDocument}
        onDelete={onDelete}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </div>
  );
});

export { useTextFolding } from "./hooks/useTextFolding";
export { EntryHeader } from "./components/EntryHeader";
export { EntryActions } from "./components/EntryActions";

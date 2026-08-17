"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { Button } from "@/components/ui/button";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { type ReactNode, useCallback, useMemo, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { parseISO } from "date-fns";
import { useAmountDisplay } from "@/modules/currency/client";
import { EditableCategorySelect } from "@/components/editable-category-select";
import { EditableField } from "@/components/ui/editable-field";
import { EntryHeader } from "./LedgerEntryViewDetails/components/EntryHeader";
import { EntryActions } from "./LedgerEntryViewDetails/components/EntryActions";
import { useTextFolding } from "./LedgerEntryViewDetails/hooks/useTextFolding";

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
  isEditMode: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onViewSourceDocument?: () => void;
  busy?: boolean;
}

export const LedgerEntryViewDetails = memo(function LedgerEntryViewDetails({
  ledgerEntry,
  categories,
  preferredCurrencies = [],
  mainCurrency = "CNY",
  pendingChanges,
  onFieldChange,
  onSave,
  isEditMode,
  onEdit,
  onCancelEdit,
  onDelete,
  onViewSourceDocument,
  busy = false,
}: LedgerEntryViewDetailsProps): ReactNode {
  const t = useTranslations("LedgerEntryDetail");
  const locale = useLocale();

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

  const entryDate =
    ledgerEntry.sourceDocument?.entryDate ??
    (ledgerEntry.createdAt !== undefined
      ? formatDateTimeForApi(new Date(ledgerEntry.createdAt))
      : "");

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  // Fields are only interactive while in edit mode (and never while a mutation is in flight).
  const fieldDisabled = !isEditMode || busy;

  const hasPendingAmountOrCurrency =
    pendingChanges.amount !== undefined || pendingChanges.currency !== undefined;
  const { converted, isDifferentCurrency, status } = useAmountDisplay({
    ledgerId: ledgerEntry.ledgerId,
    amount: displayData.amount,
    currency: displayData.currency,
    mainCurrency,
    date: entryDate != null && entryDate !== "" ? entryDate : ledgerEntry.createdAt,
    // The persisted value is authoritative until amount/currency are edited.
    persistedConvertedAmount: hasPendingAmountOrCurrency ? null : ledgerEntry.convertedAmount,
  });

  const { isExpanded, setIsExpanded, needsFolding, contentRef } = useTextFolding([
    displayData.description,
  ]);

  const formatDateTime = (dateStr: string) => {
    const parsed = dateStr.includes("T") ? parseISO(dateStr) : parseDateString(dateStr);
    return parsed.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 subtle-scrollbar">
        <EntryHeader
          itemName={displayData.itemName}
          amount={displayData.amount}
          currency={displayData.currency}
          preferredCurrencies={preferredCurrencies}
          mainCurrency={mainCurrency}
          convertedAmount={status === "success" && converted != null ? converted : null}
          isDifferentCurrency={isDifferentCurrency}
          onFieldChange={handleFieldChange}
          disabled={fieldDisabled}
          {...(category !== undefined ? { category } : {})}
        />

        <div className="rounded-lg border border-border bg-surface2/30 p-3 sm:p-4 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground shrink-0">{t("category")}:</span>
              <EditableCategorySelect
                value={displayData.categoryId}
                categories={categories}
                onChange={(categoryId) => handleFieldChange("categoryId", categoryId)}
                placeholder={t("selectCategory")}
                disabled={fieldDisabled}
              />
            </div>
          </div>

          <div className="border-t border-border/50 pt-4 mt-2">
            <EditableField
              value={displayData.description ?? ""}
              onChange={(v) => handleFieldChange("description", v != null && v !== "" ? v : null)}
              type="textarea"
              placeholder={t("addDescription")}
              displayClassName="text-sm text-text"
              inputClassName="text-sm"
              disabled={fieldDisabled}
              renderDisplay={(value: string) => {
                const hasValue = value.length > 0;
                return hasValue ? (
                  <div className="text-sm text-text">
                    <div
                      ref={contentRef}
                      className={`break-words whitespace-pre-wrap ${!isExpanded ? "line-clamp-3" : ""}`}
                    >
                      {value}
                    </div>
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

          <div className="flex justify-between items-center border-t border-border/50 pt-4">
            <span className="text-sm text-muted-foreground">{t("createdAt")}</span>
            <span className="text-sm text-text">{formatDateTime(ledgerEntry.createdAt)}</span>
          </div>
        </div>
      </div>

      <EntryActions
        hasPendingChanges={hasPendingChanges}
        isEditMode={isEditMode}
        onEdit={onEdit}
        onCancelEdit={onCancelEdit}
        onDelete={onDelete}
        onSave={onSave}
        {...(onViewSourceDocument !== undefined ? { onViewSourceDocument } : {})}
        disabled={busy}
      />
    </div>
  );
});

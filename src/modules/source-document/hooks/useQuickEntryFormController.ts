"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import { createQuickEntryAction } from "@/modules/source-document/actions";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { CreatedRecordResult } from "@/modules/source-document/contracts";

interface UseQuickEntryFormControllerParams {
  ledgerId: string;
  categories: EntryCategory[];
  mainCurrency: string;
  timeZone?: string;
  onSuccess?: (result: CreatedRecordResult) => void;
}

interface CreateQuickEntryPayload {
  categoryId: string;
  amount: number;
  currency: string;
  itemName?: string;
  entryDate: string;
}

export function useQuickEntryFormController({
  ledgerId,
  categories,
  mainCurrency,
  timeZone,
  onSuccess,
}: UseQuickEntryFormControllerParams) {
  const t = useTranslations("QuickEntryForm");
  const tCommon = useTranslations("Common");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState(() => ({
    mainCurrency,
    value: mainCurrency,
  }));
  const [itemName, setItemName] = useState("");
  const [editedEntryDate, setEditedEntryDate] = useState<string | null>(null);
  const currency = currencyDraft.mainCurrency === mainCurrency ? currencyDraft.value : mainCurrency;
  const entryDate =
    editedEntryDate ?? getDateInTimezone(timeZone) ?? formatDateTimeForApi(new Date());

  const setCurrency = useCallback(
    (value: string) => setCurrencyDraft({ mainCurrency, value }),
    [mainCurrency]
  );

  const setEntryDate = useCallback((date: string) => {
    setEditedEntryDate(date);
  }, []);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const mutation = useLedgerMutation(ledgerId, {
    mutationFn: (data: CreateQuickEntryPayload) => createQuickEntryAction(ledgerId, data),
    successMessage: null,
    errorMessage: t("quickEntryError"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (data, variables) => {
      setSelectedCategoryId(null);
      setAmount("");
      setCurrencyDraft({ mainCurrency, value: mainCurrency });
      setItemName("");
      setEditedEntryDate(null);
      onSuccess?.({
        sourceDocumentId: data.sourceDocumentId,
        entryDate: variables.entryDate,
      });
    },
  });

  const handleSubmit = () => {
    const parsedAmount = Number(amount);
    if (selectedCategoryId === null || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    const nextItemName = itemName !== "" ? itemName : undefined;
    mutation.mutate({
      categoryId: selectedCategoryId,
      amount: parsedAmount,
      currency,
      entryDate,
      ...(nextItemName !== undefined ? { itemName: nextItemName } : {}),
    });
  };

  const isDirty =
    selectedCategoryId != null ||
    amount !== "" ||
    itemName !== "" ||
    currency !== mainCurrency ||
    editedEntryDate != null;

  return {
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    amount,
    setAmount,
    currency,
    setCurrency,
    itemName,
    setItemName,
    entryDate,
    setEntryDate,
    mutation,
    handleSubmit,
    isDirty,
  };
}

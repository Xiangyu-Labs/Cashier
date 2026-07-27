"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import { createQuickEntryAction } from "@/modules/source-document/actions";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface UseQuickEntryFormControllerParams {
  ledgerId: string;
  categories: EntryCategory[];
  mainCurrency: string;
  onSuccess?: () => void;
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
  onSuccess,
}: UseQuickEntryFormControllerParams) {
  const t = useTranslations("QuickEntryForm");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(mainCurrency);
  const [itemName, setItemName] = useState("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());

  useEffect(() => {
    setCurrency(mainCurrency);
  }, [mainCurrency]);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const mutation = useLedgerMutation(ledgerId, {
    mutationFn: (data: CreateQuickEntryPayload) => createQuickEntryAction(ledgerId, data),
    successMessage: t("quickEntrySuccess"),
    errorMessage: t("quickEntryError"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: () => onSuccess?.(),
  });

  const handleSubmit = () => {
    if (selectedCategoryId === null || amount <= 0) return;
    const nextItemName = itemName !== "" ? itemName : undefined;
    mutation.mutate({
      categoryId: selectedCategoryId,
      amount,
      currency,
      entryDate: formatDateTimeForApi(entryDate),
      ...(nextItemName !== undefined ? { itemName: nextItemName } : {}),
    });
  };

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
  };
}

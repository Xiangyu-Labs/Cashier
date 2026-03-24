"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { InfiniteData } from "@tanstack/react-query";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { createQuickEntryAction } from "@/modules/source-document/actions";
import type {
  SourceDocumentCollectionDto,
  SourceDocumentListItemDto as SourceDocumentListItemWithEntries,
} from "@/modules/source-document/contracts";
import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";

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
    onOptimisticUpdate: (queryClient, variables) => {
      const tempDocId = `temp-doc-${Date.now()}`;
      const tempEntryId = `temp-entry-${Date.now()}`;
      const now = new Date().toISOString();
      const entryDateStr = variables.entryDate;
      const optimisticConvertedAmount =
        variables.currency === mainCurrency ? variables.amount.toFixed(2) : null;
      const optimisticExchangeRate = variables.currency === mainCurrency ? "1" : null;

      const tempEntry: LedgerEntry = {
        id: tempEntryId,
        ledgerId,
        sourceDocumentId: tempDocId,
        categoryId: variables.categoryId,
        amount: variables.amount.toFixed(2),
        currency: variables.currency,
        itemName: variables.itemName ?? selectedCategory?.name ?? "",
        description: null,
        convertedAmount: optimisticConvertedAmount,
        exchangeRate: optimisticExchangeRate,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: selectedCategory || null,
        sourceDocument: null,
      };

      const tempDoc: SourceDocumentListItemWithEntries = {
        id: tempDocId,
        ledgerId,
        type: "manual",
        status: "completed",
        title: selectedCategory?.name ?? null,
        text: null,
        entryDate: entryDateStr,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        metadata: {},
        imageUrls: [],
        hasImages: false,
        anomalyReason: null,
        ledgerEntries: [
          {
            id: tempEntryId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ledgerId,
            description: null,
            categoryId: variables.categoryId,
            sourceDocumentId: tempDocId,
            amount: variables.amount.toFixed(2),
            currency: variables.currency,
            itemName: variables.itemName ?? selectedCategory?.name ?? "",
            convertedAmount: optimisticConvertedAmount,
            exchangeRate: optimisticExchangeRate,
            category:
              selectedCategory !== undefined
                ? {
                    id: selectedCategory.id,
                    name: selectedCategory.name,
                    createdAt: selectedCategory.createdAt,
                    updatedAt: selectedCategory.updatedAt,
                    deletedAt: selectedCategory.deletedAt,
                    ledgerId: selectedCategory.ledgerId,
                    description: selectedCategory.description,
                    icon: selectedCategory.icon,
                    sortOrder: selectedCategory.sortOrder,
                    isEditable: selectedCategory.isEditable,
                  }
                : null,
          },
        ],
      };

      const collectionQueryKey = queryKeys.sourceDocumentCollectionPrefix(ledgerId);
      const docSnapshots = createListSnapshots<SourceDocumentCollectionDto>(
        queryClient,
        collectionQueryKey
      );
      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { queryKey: collectionQueryKey },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [tempDoc, ...old.items],
            total: old.total + 1,
          };
        }
      );

      interface EntryPage {
        items: LedgerEntry[];
      }
      const entrySnapshots = createListSnapshots<InfiniteData<EntryPage>>(
        queryClient,
        queryKeys.ledgerEntries(ledgerId)
      );
      queryClient.setQueriesData<InfiniteData<EntryPage>>(
        { queryKey: queryKeys.ledgerEntries(ledgerId) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === 0 ? { ...page, items: [tempEntry, ...page.items] } : page
            ),
          };
        }
      );

      return { snapshots: [...docSnapshots, ...entrySnapshots] };
    },
  });

  const handleSubmit = () => {
    if (selectedCategoryId === null || amount <= 0) return;
    const nextItemName = itemName !== "" ? itemName : undefined;
    onSuccess?.();
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

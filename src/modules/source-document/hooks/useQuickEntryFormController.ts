"use client";

import { useState } from "react";
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
  const [itemName, setItemName] = useState("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());

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
    onSuccessExtra: () => {
      setSelectedCategoryId(null);
      setAmount(0);
      setItemName("");
      setEntryDate(new Date());
      onSuccess?.();
    },
    onOptimisticUpdate: (queryClient, variables) => {
      const tempDocId = `temp-doc-${Date.now()}`;
      const tempEntryId = `temp-entry-${Date.now()}`;
      const now = new Date().toISOString();
      const entryDateStr = variables.entryDate;

      const tempEntry: LedgerEntry = {
        id: tempEntryId,
        ledgerId,
        sourceDocumentId: tempDocId,
        categoryId: variables.categoryId,
        amount: variables.amount.toFixed(2),
        currency: mainCurrency,
        itemName: variables.itemName ?? selectedCategory?.name ?? "",
        description: null,
        convertedAmount: variables.amount.toFixed(2),
        exchangeRate: "1",
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
            currency: mainCurrency,
            itemName: variables.itemName ?? selectedCategory?.name ?? "",
            convertedAmount: variables.amount.toFixed(2),
            exchangeRate: "1",
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

      const docSnapshots = createListSnapshots<SourceDocumentCollectionDto>(
        queryClient,
        queryKeys.sourceDocuments(ledgerId, "all")
      );
      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
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
    mutation.mutate({
      categoryId: selectedCategoryId,
      amount,
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
    itemName,
    setItemName,
    entryDate,
    setEntryDate,
    mutation,
    handleSubmit,
  };
}

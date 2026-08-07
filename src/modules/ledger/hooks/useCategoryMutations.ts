"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateEntryCategories,
  invalidateLedgerEntries,
  invalidateLedgerSettingsView,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createEntryCategoryAction,
  updateEntryCategoryAction,
  deleteEntryCategoryAction,
  reorderEntryCategoriesAction,
} from "@/modules/ledger/server-actions/categories";
import { generateEntryCategoryMetadataAction } from "@/modules/ledger/server-actions/category-metadata";
import type {
  DeleteEntryCategoryResultDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";

export function useCategoryMutations(ledgerId: string, categories: EntryCategory[]) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const [generatingCategoryIds, setGeneratingCategoryIds] = useState<Set<string>>(new Set());
  const [failedCategoryIds, setFailedCategoryIds] = useState<Set<string>>(new Set());

  const generateMetadata = useMutation({
    mutationFn: (categoryId: string) => generateEntryCategoryMetadataAction(ledgerId, categoryId),
    onMutate: (categoryId) => {
      setGeneratingCategoryIds((ids) => new Set(ids).add(categoryId));
      setFailedCategoryIds((ids) => {
        const next = new Set(ids);
        next.delete(categoryId);
        return next;
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: invalidateEntryCategories(ledgerId) });
    },
    onError: (_error, categoryId) => setFailedCategoryIds((ids) => new Set(ids).add(categoryId)),
    onSettled: (_data, _error, categoryId) =>
      setGeneratingCategoryIds((ids) => {
        const next = new Set(ids);
        next.delete(categoryId);
        return next;
      }),
  });

  const createCategory = useLedgerMutation<EntryCategory, { name: string }>(ledgerId, {
    mutationFn: async (data) => {
      const result = await createEntryCategoryAction(ledgerId, data);
      return result;
    },
    successMessage: t("categoryCreated"),
    errorMessage: t("createCategoryFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    skipInvalidation: true,
    onSuccessReconcile: (_client, category) => {
      queryClient.setQueryData<EntryCategory[]>(queryKeys.entryCategories(ledgerId), (current) => [
        ...(current ?? []).filter((item) => item.id !== category.id),
        category,
      ]);
    },
    onSuccessExtra: (category) => {
      generateMetadata.mutate(category.id);
    },
    onMutationSettled: (client, _variables, _data, error) => {
      if (error != null) {
        void client.invalidateQueries({ predicate: invalidateEntryCategories(ledgerId) });
      }
    },
  });

  const updateCategory = useLedgerMutation<
    EntryCategory,
    { id: string; data: Partial<EntryCategory> }
  >(ledgerId, {
    mutationFn: ({ id, data }) =>
      updateEntryCategoryAction(ledgerId, id, {
        ...data,
        description: data.description ?? undefined,
        icon: data.icon ?? undefined,
      }),
    successMessage: t("categoryUpdated"),
    errorMessage: t("updateCategoryFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
    ],
    onSuccessReconcile: (client, category) => {
      client.setQueryData<EntryCategory[]>(queryKeys.entryCategories(ledgerId), (current) =>
        current?.map((item) => (item.id === category.id ? { ...item, ...category } : item))
      );
    },
    onMutationSettled: (client, _ids, _data, error) => {
      if (error != null)
        void client.invalidateQueries({ predicate: invalidateEntryCategories(ledgerId) });
    },
  });

  const deleteCategory = useLedgerMutation<DeleteEntryCategoryResultDto, string>(ledgerId, {
    mutationFn: (id) => deleteEntryCategoryAction(ledgerId, id),
    successMessage: t("categoryDeleted"),
    errorMessage: t("deleteCategoryFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateLedgerSettingsView(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessReconcile: (client, result) => {
      if (!result.deleted) return;
      client.setQueryData<EntryCategory[]>(queryKeys.entryCategories(ledgerId), (current) =>
        current?.filter((category) => category.id !== result.categoryId)
      );
    },
  });

  const reorderCategories = useLedgerMutation<ReorderEntryCategoriesResultDto, string[]>(ledgerId, {
    mutationFn: (categoryIds) => reorderEntryCategoriesAction(ledgerId, categoryIds),
    successMessage: t("categoriesReordered"),
    errorMessage: t("reorderCategoriesFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
    ],
    onSuccessReconcile: (_client, result) => {
      const positions = new Map(result.categoryIds.map((id, index) => [id, index]));
      queryClient.setQueryData<EntryCategory[]>(
        queryKeys.entryCategories(ledgerId),
        [...categories]
          .sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0))
          .map((category, index) => ({ ...category, sortOrder: index }))
      );
    },
  });

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    generatingCategoryIds,
    failedCategoryIds,
    retryCategoryMetadata: (id: string) => generateMetadata.mutate(id),
  };
}

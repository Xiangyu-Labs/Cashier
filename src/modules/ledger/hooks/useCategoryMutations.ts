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
  invalidateUncategorizedCount,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createEntryCategoryAction,
  updateEntryCategoryAction,
  deleteEntryCategoryAction,
  reorderEntryCategoriesAction,
  generateEntryCategoryMetadataAction,
} from "@/modules/ledger/actions";
import { fireAndForget } from "@/lib/safe-async";
import type {
  DeleteEntryCategoryResultDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";

export function useCategoryMutations(ledgerId: string, categories: EntryCategory[]) {
  const t = useTranslations("Settings");
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
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    skipInvalidation: true,
    onSuccessExtra: (category) => {
      queryClient.setQueryData<EntryCategory[]>(queryKeys.entryCategories(ledgerId), (current) => [
        ...(current ?? []).filter((item) => item.id !== category.id),
        category,
      ]);
      generateMetadata.mutate(category.id);
    },
    onSettledExtra: (client, _variables, _data, error) => {
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
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
    ],
    onSettledExtra: (client, _ids, _data, error) => {
      if (error != null)
        void client.invalidateQueries({ predicate: invalidateEntryCategories(ledgerId) });
    },
  });

  const deleteCategory = useLedgerMutation<DeleteEntryCategoryResultDto, string>(ledgerId, {
    mutationFn: (id) => deleteEntryCategoryAction(ledgerId, id),
    successMessage: t("categoryDeleted"),
    errorMessage: t("deleteCategoryFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateUncategorizedCount(ledgerId),
      invalidateLedgerSettingsView(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSettledExtra: (queryClient) => {
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount(ledgerId) }),
        { context: "use-category-mutations" }
      );
    },
  });

  const reorderCategories = useLedgerMutation<ReorderEntryCategoriesResultDto, string[]>(ledgerId, {
    mutationFn: (categoryIds) => reorderEntryCategoriesAction(ledgerId, categoryIds),
    successMessage: t("categoriesReordered"),
    errorMessage: t("reorderCategoriesFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    skipInvalidation: true,
    onSuccessExtra: (_result, categoryIds) => {
      const positions = new Map(categoryIds.map((id, index) => [id, index]));
      queryClient.setQueryData<EntryCategory[]>(
        queryKeys.entryCategories(ledgerId),
        [...categories]
          .sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0))
          .map((category, index) => ({ ...category, sortOrder: index }))
      );
    },
    onSettledExtra: async (client, _ids, _data, error) => {
      if (error != null) return;
      await Promise.all([
        client.invalidateQueries({ predicate: invalidateEntryCategories(ledgerId) }),
        client.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
        client.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        client.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
      ]);
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

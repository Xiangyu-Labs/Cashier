"use client";
import type { EntryCategoryWithCount } from "@/modules/ledger/contracts";
import { useRef, useState } from "react";
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
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import {
  createEntryCategoryAction,
  updateEntryCategoryAction,
  deleteEntryCategoryAction,
  reorderEntryCategoriesAction,
} from "@/modules/ledger/actions";
import { fireAndForget } from "@/lib/safe-async";
import type {
  DeleteEntryCategoryResultDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";

export function useCategoryMutations(ledgerId: string, categories: EntryCategoryWithCount[]) {
  const t = useTranslations("Settings");
  const queryKey = queryKeys.entryCategories(ledgerId);
  const tempIdSequence = useRef(0);

  const [categoryCreatedTrigger, setCategoryCreatedTrigger] = useState<() => void>(() => () => {});

  const createCategory = useLedgerMutation<EntryCategory, { name: string }>(ledgerId, {
    mutationFn: async (data) => {
      const result = await createEntryCategoryAction(ledgerId, data);
      return result;
    },
    successMessage: t("categoryCreated"),
    errorMessage: t("createCategoryFailed"),
    cancelPredicates: [invalidateEntryCategories(ledgerId)],
    invalidatePredicates: [invalidateEntryCategories(ledgerId)],
    onSuccessExtra: () => {
      setCategoryCreatedTrigger(() => () => {});
    },
    onOptimisticUpdate: (queryClient, { name }) => {
      const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

      const tempCategory: EntryCategoryWithCount = {
        id: `temp-category-${ledgerId}-${++tempIdSequence.current}`,
        name,
        icon: null,
        description: null,
        isEditable: true,
        sortOrder: categories.length,
        ledgerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        entryCount: 0,
      };

      queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) => [
        ...old,
        tempCategory,
      ]);

      return { snapshots };
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
    onOptimisticUpdate: (queryClient, { id, data }) => {
      const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

      queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, ...data } : c))
      );

      return { snapshots };
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
    onOptimisticUpdate: (queryClient, id) => {
      const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

      queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) =>
        old.filter((c) => c.id !== id)
      );

      return { snapshots };
    },
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
    invalidatePredicates: [
      invalidateEntryCategories(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, categoryIds) => {
      const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

      queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) => {
        const categoryMap = new Map(old.map((c) => [c.id, c]));
        return categoryIds
          .map((id, index) => {
            const cat = categoryMap.get(id);
            return cat ? { ...cat, sortOrder: index } : null;
          })
          .filter((c): c is EntryCategoryWithCount => c !== null);
      });

      return { snapshots };
    },
  });

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    categoryCreatedTrigger,
  };
}

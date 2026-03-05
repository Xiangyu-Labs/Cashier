"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
    reorderEntryCategoriesAction,
} from "@/features/ledger/server/actions/categories";
import type { EntryCategory, EntryCategoryWithCount } from "@/types/api";

export function useCategoryMutations(ledgerId: string, categories: EntryCategoryWithCount[]) {
    const t = useTranslations("Settings");
    const queryKey = queryKeys.entryCategories(ledgerId);

    // Track category creation success to clear input
    const [categoryCreatedTrigger, setCategoryCreatedTrigger] = useState<() => void>(() => () => { });

    const createCategory = useLedgerMutation<EntryCategory, { name: string }>(ledgerId, {
        mutationFn: async (data) => {
            const result = await createEntryCategoryAction(ledgerId, data);
            return result as unknown as EntryCategory;
        },
        successMessage: t("categoryCreated"),
        errorMessage: t("createCategoryFailed"),
        onSuccessExtra: () => {
            setCategoryCreatedTrigger(() => () => { });
        },
        onOptimisticUpdate: (queryClient, { name }) => {
            const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

            const tempCategory: EntryCategoryWithCount = {
                id: `temp-${Date.now()}`,
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
        onSettledExtra: (queryClient) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.processingTasks(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const updateCategory = useLedgerMutation<void, { id: string; data: Partial<EntryCategory> }>(ledgerId, {
        mutationFn: ({ id, data }) => updateEntryCategoryAction(ledgerId, id, {
            ...data,
            description: data.description ?? undefined,
            icon: data.icon ?? undefined,
        }),
        successMessage: t("categoryUpdated"),
        errorMessage: t("updateCategoryFailed"),
        onOptimisticUpdate: (queryClient, { id, data }) => {
            const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

            queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) =>
                old.map((c) => (c.id === id ? { ...c, ...data } : c))
            );

            return { snapshots };
        },
    });

    const deleteCategory = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: (id) => deleteEntryCategoryAction(ledgerId, id),
        successMessage: t("categoryDeleted"),
        errorMessage: t("deleteCategoryFailed"),
        onOptimisticUpdate: (queryClient, id) => {
            const snapshots = createListSnapshots<EntryCategoryWithCount[]>(queryClient, queryKey);

            queryClient.setQueriesData<EntryCategoryWithCount[]>({ queryKey }, (old = []) =>
                old.filter((c) => c.id !== id)
            );

            return { snapshots };
        },
        onSettledExtra: (queryClient) => {
            // Also invalidate uncategorized count since deleted category's entries become uncategorized
            queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount(ledgerId) });
            // Invalidate task queue to immediately reflect cancelled tasks
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const reorderCategories = useLedgerMutation<void, string[]>(ledgerId, {
        mutationFn: (categoryIds) => reorderEntryCategoriesAction(ledgerId, categoryIds),
        successMessage: t("categoriesReordered"),
        errorMessage: t("reorderCategoriesFailed"),
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

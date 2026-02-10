"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
    reorderEntryCategoriesAction,
} from "@/features/ledger/server/actions/categories";
import type { EntryCategory, EntryCategoryWithCount } from "@/types/api";

export function useCategoryMutations(ledgerId: string, categories: EntryCategoryWithCount[]) {
    const queryClient = useQueryClient();
    const t = useTranslations("Settings");
    const queryKey = queryKeys.entryCategories(ledgerId);

    // Track category creation success to clear input
    const [categoryCreatedTrigger, setCategoryCreatedTrigger] = useState<() => void>(() => () => { });

    const createCategory = useMutation({
        mutationFn: async (data: { name: string }) => {
            return await createEntryCategoryAction(ledgerId, data);
        },
        onMutate: async (newCategory: { name: string }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) => [
                ...old,
                {
                    id: `temp-${Date.now()}`,
                    name: newCategory.name,
                    icon: null,
                    description: null,
                    isEditable: true,
                    sortOrder: categories.length,
                    ledgerId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null,
                    entryCount: 0,
                } as EntryCategoryWithCount
            ]);

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryCreated"));
            setCategoryCreatedTrigger(() => () => { });
        },
        onError: (_err: Error, _: { name: string }, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("createCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
            queryClient.invalidateQueries({ queryKey: queryKeys.processingTasks(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const updateCategory = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<EntryCategory> }) => {
            await updateEntryCategoryAction(ledgerId, id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            });
        },
        onMutate: async ({ id, data }: { id: string; data: Partial<EntryCategory> }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) =>
                old.map((c) => c.id === id ? { ...c, ...data } : c)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryUpdated"));
        },
        onError: (_err: Error, _: { id: string; data: Partial<EntryCategory> }, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("updateCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const deleteCategory = useMutation({
        mutationFn: async (id: string) => {
            await deleteEntryCategoryAction(ledgerId, id);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) =>
                old.filter((c) => c.id !== id)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryDeleted"));
        },
        onError: (_err: Error, _: string, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("deleteCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
            // Also invalidate uncategorized count since deleted category's entries become uncategorized
            queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount(ledgerId) });
            // Invalidate task queue to immediately reflect cancelled tasks
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const reorderCategories = useMutation({
        mutationFn: async (categoryIds: string[]) => {
            await reorderEntryCategoriesAction(ledgerId, categoryIds);
        },
        onMutate: async (categoryIds: string[]) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            // Optimistically reorder categories
            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) => {
                const categoryMap = new Map(old.map(c => [c.id, c]));
                return categoryIds
                    .map((id, index) => {
                        const cat = categoryMap.get(id);
                        return cat ? { ...cat, sortOrder: index } : null;
                    })
                    .filter((c): c is EntryCategoryWithCount => c !== null);
            });

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoriesReordered"));
        },
        onError: (_err: Error, _: string[], context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("reorderCategoriesFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
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

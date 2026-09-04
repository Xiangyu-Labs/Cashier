"use client";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createEntryCategoryAction,
  updateEntryCategoryAction,
  deleteEntryCategoryAction,
  reorderEntryCategoriesAction,
  saveEntryCategoriesAction,
} from "@/modules/ledger/server-actions/categories";
import { generateEntryCategoryMetadataAction } from "@/modules/ledger/server-actions/category-metadata";
import type {
  DeleteEntryCategoryResultDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { SaveEntryCategoriesInput } from "@/modules/ledger/contracts";
import { queryKeys } from "@/lib/query-keys";

interface UseCategoryMutationsOptions {
  onMetadataGenerated?: () => void;
}

export function useCategoryMutations(ledgerId: string, options: UseCategoryMutationsOptions = {}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const [generatingCategoryIds, setGeneratingCategoryIds] = useState<Set<string>>(new Set());
  const [failedCategoryIds, setFailedCategoryIds] = useState<Set<string>>(new Set());
  const metadataRequestIdRef = useRef(0);
  const latestMetadataRequestRef = useRef(new Map<string, number>());
  const pendingMetadataRequestsRef = useRef(new Map<string, number>());

  const finishMetadataRequest = useCallback((categoryId: string) => {
    const remaining = Math.max(0, (pendingMetadataRequestsRef.current.get(categoryId) ?? 1) - 1);
    if (remaining > 0) {
      pendingMetadataRequestsRef.current.set(categoryId, remaining);
      return;
    }
    pendingMetadataRequestsRef.current.delete(categoryId);
    setGeneratingCategoryIds((ids) => {
      const next = new Set(ids);
      next.delete(categoryId);
      return next;
    });
  }, []);

  const generateMetadata = useLedgerMutation<
    Awaited<ReturnType<typeof generateEntryCategoryMetadataAction>>,
    { categoryId: string; requestId: number }
  >(ledgerId, {
    invalidates: ["categories"],
    mutationFn: ({ categoryId }: { categoryId: string; requestId: number }) =>
      generateEntryCategoryMetadataAction(ledgerId, categoryId),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (_data, { categoryId: _categoryId }) => {
      options.onMetadataGenerated?.();
    },
    onError: (_error, { categoryId, requestId }) => {
      if (latestMetadataRequestRef.current.get(categoryId) === requestId) {
        setFailedCategoryIds((ids) => new Set(ids).add(categoryId));
      }
    },
    onSettled: (_data, _error, variables) => {
      if (variables != null) finishMetadataRequest(variables.categoryId);
    },
  });
  const requestCategoryMetadata = useCallback(
    (categoryId: string) => {
      if (pendingMetadataRequestsRef.current.has(categoryId)) return;
      const requestId = ++metadataRequestIdRef.current;
      latestMetadataRequestRef.current.set(categoryId, requestId);
      pendingMetadataRequestsRef.current.set(categoryId, 1);
      setGeneratingCategoryIds((ids) => new Set(ids).add(categoryId));
      setFailedCategoryIds((ids) => {
        const next = new Set(ids);
        next.delete(categoryId);
        return next;
      });
      generateMetadata.mutate({ categoryId, requestId });
    },
    [generateMetadata]
  );

  const createCategory = useLedgerMutation<EntryCategory, { name: string }>(ledgerId, {
    invalidates: ["categories"],
    mutationFn: async (data) => {
      const result = await createEntryCategoryAction(ledgerId, data);
      return result;
    },
    successMessage: t("categoryCreated"),
    errorMessage: t("createCategoryFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (category) => {
      requestCategoryMetadata(category.id);
    },
  });

  const updateCategory = useLedgerMutation<
    EntryCategory,
    { id: string; data: Partial<EntryCategory> }
  >(ledgerId, {
    invalidates: ["categories"],
    mutationFn: ({ id, data }) =>
      updateEntryCategoryAction(ledgerId, id, {
        ...data,
        description: data.description ?? undefined,
        icon: data.icon ?? undefined,
      }),
    successMessage: t("categoryUpdated"),
    errorMessage: t("updateCategoryFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteCategory = useLedgerMutation<DeleteEntryCategoryResultDto, string>(ledgerId, {
    invalidates: ["categories", "stats"],
    mutationFn: (id) => deleteEntryCategoryAction(ledgerId, id),
    successMessage: t("categoryDeleted"),
    errorMessage: t("deleteCategoryFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const reorderCategories = useLedgerMutation<ReorderEntryCategoriesResultDto, string[]>(ledgerId, {
    invalidates: ["categories"],
    mutationFn: (categoryIds) => reorderEntryCategoriesAction(ledgerId, categoryIds),
    successMessage: t("categoriesReordered"),
    errorMessage: t("reorderCategoriesFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const saveCategories = useLedgerMutation<EntryCategory[], SaveEntryCategoriesInput>(ledgerId, {
    invalidates: ["categories"],
    mutationFn: (input) => saveEntryCategoriesAction(ledgerId, input),
    successMessage: t("categoriesSaved"),
    errorMessage: t("saveCategoriesFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (saved, input) => {
      queryClient.setQueryData(queryKeys.entryCategories(ledgerId), saved);
      for (const category of input.categories) {
        if (category.clientId != null) requestCategoryMetadata(category.clientId);
      }
    },
  });

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    saveCategories,
    generatingCategoryIds,
    failedCategoryIds,
    retryCategoryMetadata: requestCategoryMetadata,
  };
}

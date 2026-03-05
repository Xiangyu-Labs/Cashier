/**
 * Batch Actions Hook
 *
 * Manages state and handlers for batch operations on ledger entries and source documents.
 */

import { useState, useCallback } from "react";
import { formatDateTimeForApi } from "@/lib/date-utils";

interface UseBatchActionsOptions {
    onAiCategorize?: () => void;
    onChangeCategory?: (categoryId: string | null) => void;
    onChangeCurrency?: (currency: string) => void;
    onDelete?: () => void;
    onUpdateDates?: (date: string) => void;
    onRetry?: () => void;
    // Optional loading states from mutations (external control)
    isAiCategorizingProp?: boolean;
    isChangingCategoryProp?: boolean;
    isChangingCurrencyProp?: boolean;
    isDeletingProp?: boolean;
    isUpdatingDatesProp?: boolean;
    isRetryingProp?: boolean;
}

interface UseBatchActionsResult {
    // Loading states
    isAiCategorizing: boolean;
    isChangingCategory: boolean;
    isChangingCurrency: boolean;
    isDeleting: boolean;
    isUpdatingDates: boolean;
    isRetrying: boolean;
    isProcessing: boolean;
    // UI state
    deleteConfirmOpen: boolean;
    setDeleteConfirmOpen: (open: boolean) => void;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    // Handlers
    handleAiCategorize: () => Promise<void>;
    handleChangeCategory: (categoryId: string | null) => Promise<void>;
    handleChangeCurrency: (currency: string) => Promise<void>;
    handleDelete: () => Promise<void>;
    handleUpdateDates: () => Promise<void>;
    handleRetry: () => Promise<void>;
}

export function useBatchActions({
    onAiCategorize,
    onChangeCategory,
    onChangeCurrency,
    onDelete,
    onUpdateDates,
    onRetry,
    isAiCategorizingProp,
    isChangingCategoryProp,
    isChangingCurrencyProp,
    isDeletingProp,
    isUpdatingDatesProp,
    isRetryingProp,
}: UseBatchActionsOptions): UseBatchActionsResult {
    // UI State
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Internal loading states (when not controlled externally)
    const [internalAiCategorizing, setInternalAiCategorizing] = useState(false);
    const [internalDeleting, setInternalDeleting] = useState(false);
    const [internalChangingCategory, setInternalChangingCategory] = useState(false);
    const [internalChangingCurrency, setInternalChangingCurrency] = useState(false);
    const [internalUpdatingDates, setInternalUpdatingDates] = useState(false);
    const [internalRetrying, setInternalRetrying] = useState(false);

    // Use provided loading states or fall back to internal state
    const isAiCategorizing = isAiCategorizingProp ?? internalAiCategorizing;
    const isDeleting = isDeletingProp ?? internalDeleting;
    const isChangingCategory = isChangingCategoryProp ?? internalChangingCategory;
    const isChangingCurrency = isChangingCurrencyProp ?? internalChangingCurrency;
    const isUpdatingDates = isUpdatingDatesProp ?? internalUpdatingDates;
    const isRetrying = isRetryingProp ?? internalRetrying;

    const isProcessing = isAiCategorizing || isDeleting || isChangingCategory || isChangingCurrency || isUpdatingDates || isRetrying;

    const handleAiCategorize = useCallback(async () => {
        if (!onAiCategorize) return;

        if (isAiCategorizingProp === undefined) {
            setInternalAiCategorizing(true);
            try {
                await onAiCategorize();
            } finally {
                setInternalAiCategorizing(false);
            }
        } else {
            onAiCategorize();
        }
    }, [onAiCategorize, isAiCategorizingProp]);

    const handleDelete = useCallback(async () => {
        if (!onDelete) return;

        if (isDeletingProp === undefined) {
            setInternalDeleting(true);
            try {
                await onDelete();
            } finally {
                setInternalDeleting(false);
                setDeleteConfirmOpen(false);
            }
        } else {
            onDelete();
            setDeleteConfirmOpen(false);
        }
    }, [onDelete, isDeletingProp]);

    const handleChangeCategory = useCallback(async (categoryId: string | null) => {
        if (isChangingCategoryProp === undefined) {
            setInternalChangingCategory(true);
            try {
                await onChangeCategory?.(categoryId);
            } finally {
                setInternalChangingCategory(false);
            }
        } else {
            onChangeCategory?.(categoryId);
        }
    }, [onChangeCategory, isChangingCategoryProp]);

    const handleChangeCurrency = useCallback(async (currency: string) => {
        if (isChangingCurrencyProp === undefined) {
            setInternalChangingCurrency(true);
            try {
                await onChangeCurrency?.(currency);
            } finally {
                setInternalChangingCurrency(false);
            }
        } else {
            onChangeCurrency?.(currency);
        }
    }, [onChangeCurrency, isChangingCurrencyProp]);

    const handleUpdateDates = useCallback(async () => {
        if (!onUpdateDates) return;

        const dateStr = formatDateTimeForApi(selectedDate);
        if (!dateStr) return;

        if (isUpdatingDatesProp === undefined) {
            setInternalUpdatingDates(true);
            try {
                await onUpdateDates(dateStr);
            } finally {
                setInternalUpdatingDates(false);
                setDatePickerOpen(false);
            }
        } else {
            onUpdateDates(dateStr);
            setDatePickerOpen(false);
        }
    }, [onUpdateDates, selectedDate, isUpdatingDatesProp]);

    const handleRetry = useCallback(async () => {
        if (!onRetry) return;

        if (isRetryingProp === undefined) {
            setInternalRetrying(true);
            try {
                await onRetry();
            } finally {
                setInternalRetrying(false);
            }
        } else {
            onRetry();
        }
    }, [onRetry, isRetryingProp]);

    return {
        isAiCategorizing,
        isChangingCategory,
        isChangingCurrency,
        isDeleting,
        isUpdatingDates,
        isRetrying,
        isProcessing,
        deleteConfirmOpen,
        setDeleteConfirmOpen,
        datePickerOpen,
        setDatePickerOpen,
        selectedDate,
        setSelectedDate,
        handleAiCategorize,
        handleChangeCategory,
        handleChangeCurrency,
        handleDelete,
        handleUpdateDates,
        handleRetry,
    };
}

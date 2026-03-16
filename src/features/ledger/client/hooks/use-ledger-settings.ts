"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { updateLedgerAction } from "@/features/ledger/server/actions/update";
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import type { Ledger, EntryCategoryWithCount, ServiceCredential } from "@/types/api";

interface UseLedgerSettingsParams {
    ledgerId: string;
    ledger: Ledger;
    initialCategories: EntryCategoryWithCount[];
}

interface UpdateLedgerData {
    name?: string;
    preferredCurrencies?: string[];
    mainCurrency?: string;
    aiLanguage?: string;
    collapseEntriesDefault?: boolean;
    aiCustomPrompt?: string;
    monthStartDay?: number;
}

export function useLedgerSettings({ ledgerId, ledger: initialLedger, initialCategories }: UseLedgerSettingsParams) {
    const t = useTranslations("Settings");

    // Subscribe to ledger data for reactive updates (optimistic updates will update this)
    const { data: ledger = initialLedger } = useQuery<Ledger | null>({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => getLedgerAction(ledgerId),
        initialData: initialLedger,
    });

    // Separate query for categories (same key as useCategoryMutations)
    // This ensures optimistic updates from useCategoryMutations are reflected immediately
    // Use smart polling to automatically refresh when AI generates metadata
    const { data: categories = initialCategories } = useSmartPolling<EntryCategoryWithCount[]>({
        queryKey: queryKeys.entryCategories(ledgerId),
        queryFn: () => getEntryCategoriesAction(ledgerId),
        initialData: initialCategories,
        // Polling is active when any category needs metadata generation (icon/description)
        isActive: (data) => data?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        cooldownInterval: 5000, // Shorter cooldown for faster updates when AI completes
    });

    // Use smart polling for settings data that may need background updates
    // (e.g., uncategorizedCount and credentials don't change often)
    const { data: settingsData } = useSmartPolling<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
    }>({
        queryKey: queryKeys.ledgerSettings(ledgerId),
        queryFn: () => getLedgerSettingsAction(ledgerId),
        // Polling is active when any category needs metadata generation (icon/description)
        isActive: () => categories?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        initialData: {
            uncategorizedCount: 0,
            credentials: [],
        }
    });

    const uncategorizedCount = settingsData?.uncategorizedCount || 0;
    const credentials = settingsData?.credentials || [];

    const ledgerQueryKey = queryKeys.ledger(ledgerId);
    const queryClient = useQueryClient();

    // Mutation for updating ledger settings with proper optimistic updates
    const updateLedgerMutation = useLedgerMutation<Ledger, UpdateLedgerData>(ledgerId, {
        mutationFn: async (data) => {
            // Transform flat structure to nested structure expected by updateLedgerAction
            const {
                name,
                preferredCurrencies,
                mainCurrency,
                aiLanguage,
                collapseEntriesDefault,
                aiCustomPrompt,
                monthStartDay,
            } = data;
            const payload: { name?: string; settings?: Record<string, unknown> } = {};

            if (name !== undefined) {
                payload.name = name;
            }

            const settings: Record<string, unknown> = {};
            if (preferredCurrencies !== undefined) settings.currencies = preferredCurrencies;
            if (mainCurrency !== undefined) settings.mainCurrency = mainCurrency;
            if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
            if (collapseEntriesDefault !== undefined) settings.collapseEntriesDefault = collapseEntriesDefault;
            if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;
            if (monthStartDay !== undefined) settings.monthStartDay = monthStartDay;

            if (Object.keys(settings).length > 0) {
                payload.settings = settings;
            }

            return await updateLedgerAction(ledgerId, payload);
        },
        successMessage: t("updateSuccess"),
        errorMessage: t("updateFailed"),
        onSuccessExtra: (data) => {
            // Use server-returned data to update cache, ensuring consistency
            queryClient.setQueryData<Ledger>(ledgerQueryKey, data);
        },
        onOptimisticUpdate: (_, newData) => {
            const snapshots = queryClient.getQueriesData<Ledger>({ queryKey: ledgerQueryKey });

            queryClient.setQueryData<Ledger>(ledgerQueryKey, (old) => {
                if (!old) return old;

                const updated = { ...old };

                // Update name if provided
                if (newData.name !== undefined) {
                    updated.name = newData.name;
                }

                // Update settings if provided
                if (
                    newData.preferredCurrencies !== undefined ||
                    newData.mainCurrency !== undefined ||
                    newData.aiLanguage !== undefined ||
                    newData.collapseEntriesDefault !== undefined ||
                    newData.aiCustomPrompt !== undefined ||
                    newData.monthStartDay !== undefined
                ) {
                    updated.metadata = {
                        ...old.metadata,
                        settings: {
                            ...old.metadata?.settings,
                            ...(newData.preferredCurrencies !== undefined && { currencies: newData.preferredCurrencies }),
                            ...(newData.mainCurrency !== undefined && { mainCurrency: newData.mainCurrency }),
                            ...(newData.aiLanguage !== undefined && { aiLanguage: newData.aiLanguage }),
                            ...(newData.collapseEntriesDefault !== undefined && { collapseEntriesDefault: newData.collapseEntriesDefault }),
                            ...(newData.aiCustomPrompt !== undefined && { aiCustomPrompt: newData.aiCustomPrompt }),
                            ...(newData.monthStartDay !== undefined && { monthStartDay: newData.monthStartDay }),
                        },
                    };
                }

                return updated;
            });

            return { snapshots };
        },
        onSettledExtra: (qc) => {
            qc.invalidateQueries({ queryKey: queryKeys.ledgerSettings(ledgerId) });
        },
    });

    return {
        ledger,
        categories,
        uncategorizedCount,
        credentials,
        updateLedgerMutation,
        isPending: updateLedgerMutation.isPending,
    };
}

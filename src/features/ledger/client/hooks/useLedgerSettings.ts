"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { updateLedgerAction } from "@/features/ledger/server/actions/ledgers";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import type { Ledger, EntryCategoryWithCount, ServiceCredential } from "@/types/api";

interface UseLedgerSettingsParams {
    ledgerId: string;
    ledger: Ledger;
    initialCategories: EntryCategoryWithCount[];
}

export function useLedgerSettings({ ledgerId, ledger: _ledger, initialCategories }: UseLedgerSettingsParams) {
    const queryClient = useQueryClient();
    const t = useTranslations("Settings");

    // Batch fetch all settings data - Use smart polling for categories that need metadata generation
    const { data: settingsData } = useSmartPolling<{
        categories: EntryCategoryWithCount[];
        uncategorizedCount: number;
        credentials: ServiceCredential[];
    }>({
        queryKey: queryKeys.ledgerSettings(ledgerId),
        queryFn: () => getLedgerSettingsAction(ledgerId),
        isActive: (data) => data?.categories?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        initialData: {
            categories: initialCategories,
            uncategorizedCount: 0,
            credentials: [],
        }
    });

    const categories = settingsData?.categories || [];
    const uncategorizedCount = settingsData?.uncategorizedCount || 0;
    const credentials = settingsData?.credentials || [];

    const ledgerQueryKey = queryKeys.ledger(ledgerId);

    // Mutation for updating ledger settings with proper optimistic updates
    const updateLedgerMutation = useMutation({
        mutationFn: async (data: {
            name?: string;
            preferredCurrencies?: string[];
            mainCurrency?: string;
            aiLanguage?: string;
            collapseBillsDefault?: boolean;
            aiCustomPrompt?: string;
        }) => {
            // Transform flat structure to nested structure expected by updateLedgerAction
            const { name, preferredCurrencies, mainCurrency, aiLanguage, collapseBillsDefault, aiCustomPrompt } = data;
            const payload: { name?: string; settings?: Record<string, unknown> } = {};

            if (name !== undefined) {
                payload.name = name;
            }

            const settings: Record<string, unknown> = {};
            if (preferredCurrencies !== undefined) settings.currencies = preferredCurrencies;
            if (mainCurrency !== undefined) settings.mainCurrency = mainCurrency;
            if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
            if (collapseBillsDefault !== undefined) settings.collapseBillsDefault = collapseBillsDefault;
            if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;

            if (Object.keys(settings).length > 0) {
                payload.settings = settings;
            }

            await updateLedgerAction(ledgerId, payload);
        },
        onMutate: async (newData) => {
            // Cancel any outgoing queries
            await queryClient.cancelQueries({ queryKey: ledgerQueryKey });

            // Snapshot the previous value
            const previousLedger = queryClient.getQueryData<Ledger>(ledgerQueryKey);

            // Optimistically update the cache
            queryClient.setQueryData<Ledger>(ledgerQueryKey, (old) => {
                if (!old) return old;

                const updated = { ...old };

                // Update name if provided
                if (newData.name !== undefined) {
                    updated.name = newData.name;
                }

                // Update settings if provided
                if (newData.preferredCurrencies !== undefined ||
                    newData.mainCurrency !== undefined ||
                    newData.aiLanguage !== undefined ||
                    newData.collapseBillsDefault !== undefined ||
                    newData.aiCustomPrompt !== undefined) {

                    updated.metadata = {
                        ...old.metadata,
                        settings: {
                            ...old.metadata?.settings,
                            ...(newData.preferredCurrencies !== undefined && { currencies: newData.preferredCurrencies }),
                            ...(newData.mainCurrency !== undefined && { mainCurrency: newData.mainCurrency }),
                            ...(newData.aiLanguage !== undefined && { aiLanguage: newData.aiLanguage }),
                            ...(newData.collapseBillsDefault !== undefined && { collapseBillsDefault: newData.collapseBillsDefault }),
                            ...(newData.aiCustomPrompt !== undefined && { aiCustomPrompt: newData.aiCustomPrompt }),
                        }
                    };
                }

                return updated;
            });

            // Return context with the previous value
            return { previousLedger };
        },
        onSuccess: () => {
            toast.success(t("updateSuccess"));
        },
        onError: (_err, _variables, context) => {
            toast.error(t("updateFailed"));

            // Rollback to previous value on error
            if (context?.previousLedger) {
                queryClient.setQueryData(ledgerQueryKey, context.previousLedger);
            }
        },
        onSettled: () => {
            // Invalidate to sync with server
            queryClient.invalidateQueries({ queryKey: ledgerQueryKey });
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgerSettings(ledgerId) });
        },
    });

    return {
        categories,
        uncategorizedCount,
        credentials,
        updateLedgerMutation,
        isPending: updateLedgerMutation.isPending,
    };
}

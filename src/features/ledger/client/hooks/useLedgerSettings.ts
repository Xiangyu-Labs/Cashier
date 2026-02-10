"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { updateLedgerAction } from "@/features/ledger/server/actions/ledgers";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import type { Ledger, EntryCategoryWithCount, ServiceCredential } from "@/types/api";

interface UseLedgerSettingsParams {
    ledgerId: string;
    ledger: Ledger;
    initialCategories: EntryCategoryWithCount[];
}

export function useLedgerSettings({ ledgerId, ledger, initialCategories }: UseLedgerSettingsParams) {
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

    // Local state for Ledger Name
    const [localLedgerName, setLocalLedgerName] = useState(ledger.name);
    const [isNameFocused, setIsNameFocused] = useState(false);

    // Sync from props only when not focused and not pending
    const updateLedgerMutation = useMutation({
        mutationFn: async (data: {
            name?: string;
            preferredCurrencies?: string[];
            aiLanguage?: string;
            collapseBillsDefault?: boolean;
            aiCustomPrompt?: string;
        }) => {
            // Transform flat structure to nested structure expected by updateLedgerAction
            const { name, preferredCurrencies, aiLanguage, collapseBillsDefault, aiCustomPrompt, ...rest } = data;
            const payload: { name?: string; settings?: Record<string, unknown> } = {};

            if (name !== undefined) {
                payload.name = name;
            }

            const settings: Record<string, unknown> = {};
            if (preferredCurrencies !== undefined) settings.currencies = preferredCurrencies;
            if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
            if (collapseBillsDefault !== undefined) settings.collapseBillsDefault = collapseBillsDefault;
            if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;

            if (Object.keys(settings).length > 0) {
                payload.settings = settings;
            }

            await updateLedgerAction(ledgerId, payload);
        },
        onSuccess: () => {
            toast.success(t("updateSuccess"));
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
        onError: () => {
            toast.error(t("updateFailed"));
        },
    });

    // Sync local name from props when not focused and not pending
    if (!isNameFocused && !updateLedgerMutation.isPending && localLedgerName !== ledger.name) {
        setLocalLedgerName(ledger.name);
    }

    // Local state for AI Prompt
    const [localAiPrompt, setLocalAiPrompt] = useState(ledger.metadata?.settings?.aiCustomPrompt || "");
    const [isPromptFocused, setIsPromptFocused] = useState(false);

    // Sync from props only when not focused and not pending
    if (!isPromptFocused && !updateLedgerMutation.isPending && localAiPrompt !== (ledger.metadata?.settings?.aiCustomPrompt || "")) {
        setLocalAiPrompt(ledger.metadata?.settings?.aiCustomPrompt || "");
    }

    // Optimistic state for collapse bills
    const [optimisticCollapseBills, setOptimisticCollapseBills] = useState(ledger.metadata?.settings?.collapseBillsDefault);

    const updateLedger = async (data: {
        name?: string;
        preferredCurrencies?: string[];
        aiLanguage?: string;
        collapseBillsDefault?: boolean;
        aiCustomPrompt?: string;
    }) => {
        // Optimistic update for collapse bills
        if (data.collapseBillsDefault !== undefined) {
            setOptimisticCollapseBills(data.collapseBillsDefault);
        }

        try {
            await updateLedgerMutation.mutateAsync(data);
        } catch (error) {
            // Revert optimistic updates on error
            setOptimisticCollapseBills(ledger.metadata?.settings?.collapseBillsDefault);
        }
    };

    return {
        categories,
        uncategorizedCount,
        credentials,
        updateLedger,
        isPending: updateLedgerMutation.isPending,
        localLedgerName,
        setLocalLedgerName,
        isNameFocused,
        setIsNameFocused,
        localAiPrompt,
        setLocalAiPrompt,
        isPromptFocused,
        setIsPromptFocused,
        optimisticCollapseBills,
    };
}

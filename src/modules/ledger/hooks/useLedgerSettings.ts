"use client";
import type { EntryCategoryWithCount, ServiceCredential } from "@/modules/ledger/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { invalidateLedger, invalidateLedgerSettings, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { updateLedgerAction, getLedgerAction, getLedgerSettingsAction, getEntryCategoriesAction, } from "@/modules/ledger/actions";
import { fireAndForget } from "@/lib/safe-async";
import type { Ledger } from "@/modules/ledger/contracts";

interface UseLedgerSettingsParams {
  ledgerId: string;
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
}

interface UpdateLedgerData {
  preferredCurrencies?: string[];
  mainCurrency?: string;
  aiLanguage?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
}

export function useLedgerSettings({
  ledgerId,
  ledger: initialLedger,
  initialCategories,
}: UseLedgerSettingsParams) {
  const t = useTranslations("Settings");

  const { data: ledger = initialLedger } = useQuery<Ledger | null>({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    initialData: initialLedger,
  });

  const { data: categories = initialCategories } = useQuery<EntryCategoryWithCount[]>({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    initialData: initialCategories,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasPendingMetadata =
        data?.some(
          (c) =>
            c.icon == null || c.icon === "" || c.description == null || c.description === ""
        ) ?? false;
      return hasPendingMetadata ? 3000 : false;
    },
  });

  const { data: settingsData, isLoading: isSettingsLoading } = useQuery<{
    uncategorizedCount: number;
    credentials: ServiceCredential[];
  }>({
    queryKey: queryKeys.ledgerSettings(ledgerId),
    queryFn: () => getLedgerSettingsAction(ledgerId),
  });

  const uncategorizedCount = settingsData?.uncategorizedCount ?? 0;
  const credentials = settingsData?.credentials ?? [];

  const ledgerQueryKey = queryKeys.ledger(ledgerId);
  const queryClient = useQueryClient();

  const updateLedgerMutation = useLedgerMutation<Ledger, UpdateLedgerData>(ledgerId, {
    mutationFn: async (data) => {
      const {
        preferredCurrencies,
        mainCurrency,
        aiLanguage,
        collapseEntriesDefault,
        aiCustomPrompt,
      } = data;
      const payload: { settings?: Record<string, unknown> } = {};

      const settings: Record<string, unknown> = {};
      if (preferredCurrencies !== undefined) settings.currencies = preferredCurrencies;
      if (mainCurrency !== undefined) settings.mainCurrency = mainCurrency;
      if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
      if (collapseEntriesDefault !== undefined) {
        settings.collapseEntriesDefault = collapseEntriesDefault;
      }
      if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;

      if (Object.keys(settings).length > 0) {
        payload.settings = settings;
      }

      return await updateLedgerAction(ledgerId, payload);
    },
    successMessage: t("updateSuccess"),
    errorMessage: t("updateFailed"),
    cancelPredicates: [invalidateLedger(ledgerId)],
    invalidatePredicates: [invalidateLedger(ledgerId)],
    onSuccessExtra: (data) => {
      queryClient.setQueryData<Ledger>(ledgerQueryKey, data);
    },
    onOptimisticUpdate: (_, newData) => {
      const snapshots = queryClient.getQueriesData<Ledger>({ queryKey: ledgerQueryKey });

      queryClient.setQueryData<Ledger>(ledgerQueryKey, (old) => {
        if (!old) return old;

        const updated = { ...old };

        if (
          newData.preferredCurrencies !== undefined ||
          newData.mainCurrency !== undefined ||
          newData.aiLanguage !== undefined ||
          newData.collapseEntriesDefault !== undefined ||
          newData.aiCustomPrompt !== undefined
        ) {
          updated.metadata = {
            ...old.metadata,
            settings: {
              ...old.metadata?.settings,
              ...(newData.preferredCurrencies !== undefined && {
                currencies: newData.preferredCurrencies,
              }),
              ...(newData.mainCurrency !== undefined && { mainCurrency: newData.mainCurrency }),
              ...(newData.aiLanguage !== undefined && { aiLanguage: newData.aiLanguage }),
              ...(newData.collapseEntriesDefault !== undefined && {
                collapseEntriesDefault: newData.collapseEntriesDefault,
              }),
              ...(newData.aiCustomPrompt !== undefined && {
                aiCustomPrompt: newData.aiCustomPrompt,
              }),
            },
          };
        }

        return updated;
      });

      return { snapshots };
    },
    onSettledExtra: (qc) => {
      fireAndForget(qc.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) }), {
        context: "use-ledger-settings",
      });
    },
  });

  return {
    ledger,
    categories,
    uncategorizedCount,
    credentials,
    updateLedgerMutation,
    isPending: updateLedgerMutation.isPending,
    isSettingsLoading,
  };
}

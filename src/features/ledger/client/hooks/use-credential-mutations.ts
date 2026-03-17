"use client";

import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
    createServiceCredentialAction,
    deleteServiceCredentialAction,
} from "@/features/ledger/server/actions/credentials";
import type { ServiceCredential } from "@/types/api";

export function useCredentialMutations(ledgerId: string) {
    const t = useTranslations("Settings");
    // Use the same queryKey as useLedgerSettings to ensure optimistic updates are reflected immediately
    const queryKey = queryKeys.ledgerSettings(ledgerId);

    const createCredential = useLedgerMutation<ServiceCredential, string>(ledgerId, {
        mutationFn: (name) => createServiceCredentialAction(ledgerId, { name }),
        successMessage: t("credentialCreated"),
        errorMessage: t("createFailed"),
        onOptimisticUpdate: (queryClient, name) => {
            const tempCredential: ServiceCredential = {
                id: `temp-${Date.now()}`,
                name,
                ledgerId,
                key: "••••••••", // Placeholder
                createdAt: new Date().toISOString(),
                deletedAt: null,
                lastUsedAt: null,
            };
            // Optimistically add to the ledgerSettings query data
            const prevData = queryClient.getQueryData<{ uncategorizedCount: number; credentials: ServiceCredential[] }>(queryKey);
            if (prevData) {
                queryClient.setQueryData(queryKey, {
                    ...prevData,
                    credentials: [...prevData.credentials, tempCredential],
                });
            }
            return { prevData, tempId: tempCredential.id };
        },
        onSuccessExtra: (data, _variables, context) => {
            // Replace the temp credential with the real one from server
            const currentData = queryClient.getQueryData<{ uncategorizedCount: number; credentials: ServiceCredential[] }>(queryKey);
            if (currentData) {
                queryClient.setQueryData(queryKey, {
                    ...currentData,
                    credentials: currentData.credentials.map((c) =>
                        c.id === (context as { tempId: string } | undefined)?.tempId ? data : c
                    ),
                });
            }
        },
        onRollback: (queryClient, context) => {
            // Rollback to previous data if mutation fails
            if (context?.prevData) {
                queryClient.setQueryData(queryKey, context.prevData);
            }
        },
    });

    const deleteCredential = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
        successMessage: t("credentialDeleted"),
        errorMessage: t("deleteFailed"),
        onOptimisticUpdate: (queryClient, id) => {
            // Optimistically remove from the ledgerSettings query data
            const prevData = queryClient.getQueryData<{ uncategorizedCount: number; credentials: ServiceCredential[] }>(queryKey);
            if (prevData) {
                queryClient.setQueryData(queryKey, {
                    ...prevData,
                    credentials: prevData.credentials.filter((c) => c.id !== id),
                });
            }
            return { prevData };
        },
        onRollback: (queryClient, context) => {
            // Rollback to previous data if mutation fails
            if (context?.prevData) {
                queryClient.setQueryData(queryKey, context.prevData);
            }
        },
    });

    return {
        createCredential,
        deleteCredential,
    };
}

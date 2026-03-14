"use client";

import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    useLedgerMutation,
    optimisticallyAddToList,
    optimisticallyDeleteFromList,
} from "@/lib/mutations/use-ledger-mutation";
import {
    createServiceCredentialAction,
    deleteServiceCredentialAction,
} from "@/features/ledger/server/actions/credentials";
import type { ServiceCredential } from "@/types/api";

export function useCredentialMutations(ledgerId: string) {
    const t = useTranslations("Settings");
    const queryKey = queryKeys.serviceCredentials(ledgerId);

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
            return optimisticallyAddToList<ServiceCredential>(queryClient, queryKey, tempCredential);
        },
    });

    const deleteCredential = useLedgerMutation<void, string>(ledgerId, {
        mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
        successMessage: t("credentialDeleted"),
        errorMessage: t("deleteFailed"),
        onOptimisticUpdate: (queryClient, id) => {
            return optimisticallyDeleteFromList<ServiceCredential>(queryClient, queryKey, id);
        },
    });

    return {
        createCredential,
        deleteCredential,
    };
}

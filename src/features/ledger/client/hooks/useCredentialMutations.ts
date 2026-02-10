"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    createServiceCredentialAction,
    deleteServiceCredentialAction,
} from "@/features/ledger/server/actions/credentials";
import type { ServiceCredential } from "@/types/api";

export function useCredentialMutations(ledgerId: string) {
    const queryClient = useQueryClient();
    const t = useTranslations("Settings");

    const createCredential = useMutation({
        mutationFn: async (name: string) => {
            return await createServiceCredentialAction(ledgerId, { name });
        },
        onMutate: async (name: string) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
            const previousCredentials = queryClient.getQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId));

            // Optimistically add the new credential
            queryClient.setQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId), (old = []) => [
                ...old,
                {
                    id: `temp-${Date.now()}`,
                    name,
                    ledgerId,
                    key: '••••••••', // Placeholder
                    createdAt: new Date().toISOString(),
                    deletedAt: null,
                    lastUsedAt: null,
                } as ServiceCredential
            ]);

            return { previousCredentials };
        },
        onSuccess: () => {
            toast.success(t("credentialCreated"));
        },
        onError: (_err: Error, _: string, context: { previousCredentials?: ServiceCredential[] } | undefined) => {
            toast.error(t("createFailed"));
            if (context?.previousCredentials) {
                queryClient.setQueryData(queryKeys.serviceCredentials(ledgerId), context.previousCredentials);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
        },
    });

    const deleteCredential = useMutation({
        mutationFn: async (id: string) => {
            await deleteServiceCredentialAction(ledgerId, id);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
            const previousCredentials = queryClient.getQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId));

            // Optimistically remove the credential
            queryClient.setQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId), (old = []) =>
                old.filter((c) => c.id !== id)
            );

            return { previousCredentials };
        },
        onSuccess: () => {
            toast.success(t("credentialDeleted"));
        },
        onError: (_err: Error, _: string, context: { previousCredentials?: ServiceCredential[] } | undefined) => {
            toast.error(t("deleteFailed"));
            if (context?.previousCredentials) {
                queryClient.setQueryData(queryKeys.serviceCredentials(ledgerId), context.previousCredentials);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
        },
    });

    return {
        createCredential,
        deleteCredential,
    };
}

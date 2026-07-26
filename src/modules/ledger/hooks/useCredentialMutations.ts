"use client";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { matchExactQueryKey, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
} from "@/modules/ledger/actions";
import type { ServiceCredential, CreatedServiceCredential } from "@/modules/ledger/contracts";

interface CreateCredentialContext {
  prevData: { uncategorizedCount: number; credentials: ServiceCredential[] } | undefined;
  tempId: string;
}

interface DeleteCredentialContext {
  prevData: { uncategorizedCount: number; credentials: ServiceCredential[] } | undefined;
}

export function useCredentialMutations(ledgerId: string) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const queryKey = queryKeys.ledgerSettings(ledgerId);
  const tempIdSequence = useRef(0);

  const createCredential = useLedgerMutation<
    CreatedServiceCredential,
    string,
    CreateCredentialContext
  >(ledgerId, {
    mutationFn: (name) => createServiceCredentialAction(ledgerId, { name }),
    successMessage: t("credentialCreated"),
    errorMessage: t("createFailed"),
    cancelPredicates: [matchExactQueryKey(queryKey)],
    skipInvalidation: true,
    onOptimisticUpdate: (queryClient, name) => {
      const tempCredential: ServiceCredential = {
        id: `temp-credential-${ledgerId}-${++tempIdSequence.current}`,
        name,
        ledgerId,
        tokenPrefix: "••••••••",
        tokenSuffix: "••••",
        createdAt: new Date().toISOString(),
        deletedAt: null,
        lastUsedAt: null,
      };

      const prevData = queryClient.getQueryData<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
      }>(queryKey);

      if (prevData) {
        queryClient.setQueryData(queryKey, {
          ...prevData,
          credentials: [...prevData.credentials, tempCredential],
        });
      }

      return { prevData, tempId: tempCredential.id };
    },
    onSuccessExtra: (data, _variables, context) => {
      const currentData = queryClient.getQueryData<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
      }>(queryKey);
      if (currentData) {
        queryClient.setQueryData(queryKey, {
          ...currentData,
          credentials: currentData.credentials.map((c) => (c.id === context?.tempId ? data : c)),
        });
      }
    },
    onRollback: (queryClient, context) => {
      if (context?.prevData) {
        queryClient.setQueryData(queryKey, context.prevData);
      }
    },
  });

  const deleteCredential = useLedgerMutation<void, string, DeleteCredentialContext>(ledgerId, {
    mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
    successMessage: t("credentialDeleted"),
    errorMessage: t("deleteFailed"),
    cancelPredicates: [matchExactQueryKey(queryKey)],
    skipInvalidation: true,
    onOptimisticUpdate: (queryClient, id) => {
      const prevData = queryClient.getQueryData<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
      }>(queryKey);
      if (prevData) {
        queryClient.setQueryData(queryKey, {
          ...prevData,
          credentials: prevData.credentials.filter((c) => c.id !== id),
        });
      }
      return { prevData };
    },
    onRollback: (queryClient, context) => {
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

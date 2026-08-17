"use client";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { matchExactQueryKey, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
} from "@/modules/ledger/server-actions/credentials";
import type { ServiceCredential, CreatedServiceCredential } from "@/modules/ledger/contracts";

function stripCredentialToken({
  token: _token,
  ...credential
}: CreatedServiceCredential): ServiceCredential {
  return credential;
}

export function useCredentialMutations(ledgerId: string) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const queryKey = queryKeys.ledgerSettings(ledgerId);
  const createCredential = useLedgerMutation<CreatedServiceCredential, string>(ledgerId, {
    mutationFn: (name) => createServiceCredentialAction(ledgerId, { name }),
    successMessage: t("credentialCreated"),
    errorMessage: t("createFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    emitMutationEvent: false,
    cancelPredicates: [matchExactQueryKey(queryKey)],
    skipInvalidation: true,
    onSuccessReconcile: (_client, data) => {
      const currentData = queryClient.getQueryData<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
      }>(queryKey);
      if (currentData) {
        queryClient.setQueryData(queryKey, {
          ...currentData,
          credentials: [...currentData.credentials, stripCredentialToken(data)],
        });
      }
    },
  });

  const deleteCredential = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
    successMessage: t("credentialDeleted"),
    errorMessage: t("deleteFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    emitMutationEvent: false,
    cancelPredicates: [matchExactQueryKey(queryKey)],
    skipInvalidation: true,
    onSuccessReconcile: (_client, _data, id) => {
      const currentData = queryClient.getQueryData<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
      }>(queryKey);
      if (currentData) {
        queryClient.setQueryData(queryKey, {
          ...currentData,
          credentials: currentData.credentials.filter((credential) => credential.id !== id),
        });
      }
    },
  });

  return {
    createCredential,
    deleteCredential,
  };
}

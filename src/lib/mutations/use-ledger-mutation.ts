import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  invalidateLedgerMutationResources,
  type LedgerMutationResourceGroup,
} from "./ledger-mutation-resources";

export interface UseLedgerMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  resourceGroups: readonly LedgerMutationResourceGroup[];
  successMessage?: string | null;
  errorMessage?: string | null;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void;
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables | undefined
  ) => void | Promise<void>;
}

export function useLedgerMutation<TData = unknown, TVariables = void>(
  ledgerId: string | null | undefined,
  options: UseLedgerMutationOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    resourceGroups,
    successMessage,
    errorMessage,
    onSuccess,
    onError,
    onSettled,
  } = options;

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      try {
        await onSuccess?.(data, variables);
      } catch (error) {
        console.error("[useLedgerMutation] success callback failed", { ledgerId, error });
      }

      if (successMessage != null) toast.success(successMessage);

      if (ledgerId != null && ledgerId !== "") {
        await invalidateLedgerMutationResources(queryClient, ledgerId, resourceGroups);
      }
    },
    onError: (error, variables) => {
      if (errorMessage != null) toast.error(errorMessage);
      onError?.(error, variables);
    },
    onSettled: async (data, error, variables) => {
      await onSettled?.(data, error, variables);
    },
  });
}

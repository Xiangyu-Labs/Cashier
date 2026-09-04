import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

export interface UseLedgerMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successMessage?: string | null;
  errorMessage?: string | null;
  invalidationErrorMessage?: string | null;
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
    successMessage,
    errorMessage,
    invalidationErrorMessage = "Saved, but the latest data could not be refreshed. Retry.",
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
        console.error("[useLedgerMutation] success callback failed", { error });
      }

      if (successMessage != null) toast.success(successMessage);
    },
    onError: (error, variables) => {
      if (errorMessage != null) toast.error(errorMessage);
      onError?.(error, variables);
    },
    onSettled: async (data, error, variables) => {
      try {
        await onSettled?.(data, error, variables);
      } finally {
        if (ledgerId != null && ledgerId !== "") {
          try {
            await queryClient.invalidateQueries({
              queryKey: queryKeys.ledger(ledgerId),
              refetchType: "active",
            });
          } catch (invalidationError) {
            console.error("[useLedgerMutation] resource invalidation failed", {
              error: invalidationError,
            });
            if (invalidationErrorMessage != null) toast.error(invalidationErrorMessage);
            globalThis.setTimeout(() => {
              void queryClient
                .invalidateQueries({
                  queryKey: queryKeys.ledger(ledgerId),
                  refetchType: "active",
                })
                .catch((retryError) => {
                  console.error("[useLedgerMutation] resource invalidation retry failed", {
                    error: retryError,
                  });
                });
            }, 1_000);
          }
        }
      }
    },
  });
}

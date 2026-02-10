import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import { invalidateLedgerCache } from "@/lib/query-keys";
import { toast } from "sonner";

interface UseLedgerMutationOptions<TData, TVariables, TContext = unknown> {
  /**
   * The mutation function to execute
   */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /**
   * Success toast message
   */
  successMessage?: string;

  /**
   * Error toast message
   */
  errorMessage?: string;

  /**
   * Optional function to perform optimistic updates
   * Should return context data for rollback
   */
  onOptimisticUpdate?: (queryClient: ReturnType<typeof useQueryClient>, variables: TVariables) => TContext;

  /**
   * Optional function to rollback optimistic updates on error
   */
  onRollback?: (queryClient: ReturnType<typeof useQueryClient>, context: TContext | undefined) => void;

  /**
   * Additional callback to run on success (e.g., close modal, clear selection)
   */
  onSuccessExtra?: (data: TData, variables: TVariables) => void;

  /**
   * Additional callback to run on error
   */
  onErrorExtra?: (error: Error, variables: TVariables) => void;

  /**
   * Override default invalidation behavior
   * By default, invalidates all queries related to the ledger
   */
  customInvalidation?: (queryClient: ReturnType<typeof useQueryClient>) => void;
}

/**
 * Generic mutation hook for ledger-related operations.
 * Handles the common pattern of:
 * 1. Cancel queries and snapshot (onMutate)
 * 2. Execute mutation
 * 3. Show success toast (onSuccess)
 * 4. Rollback on error (onError)
 * 5. Invalidate queries (onSettled)
 *
 * @param ledgerId - The ledger ID for scoped cache invalidation
 * @param options - Mutation configuration
 */
export function useLedgerMutation<TData = unknown, TVariables = void, TContext = unknown>(
  ledgerId: string,
  options: UseLedgerMutationOptions<TData, TVariables, TContext>
) {
  const queryClient = useQueryClient();

  const {
    mutationFn,
    successMessage,
    errorMessage,
    onOptimisticUpdate,
    onRollback,
    onSuccessExtra,
    onErrorExtra,
    customInvalidation,
  } = options;

  return useMutation<TData, Error, TVariables, TContext>({
    mutationFn,

    onMutate: async (variables) => {
      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

      // Perform optimistic update if provided
      if (onOptimisticUpdate) {
        return onOptimisticUpdate(queryClient, variables);
      }

      return undefined as TContext;
    },

    onSuccess: (data, variables) => {
      // Show success toast if message provided
      if (successMessage) {
        toast.success(successMessage);
      }

      // Run additional success callback
      if (onSuccessExtra) {
        onSuccessExtra(data, variables);
      }
    },

    onError: (error, variables, context) => {
      // Rollback optimistic updates if provided
      if (onRollback && context !== undefined) {
        onRollback(queryClient, context);
      }

      // Show error toast if message provided
      if (errorMessage) {
        toast.error(errorMessage);
      }

      // Run additional error callback
      if (onErrorExtra) {
        onErrorExtra(error, variables);
      }
    },

    onSettled: () => {
      // Always invalidate queries to ensure fresh data
      if (customInvalidation) {
        customInvalidation(queryClient);
      } else {
        queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
      }
    },
  });
}

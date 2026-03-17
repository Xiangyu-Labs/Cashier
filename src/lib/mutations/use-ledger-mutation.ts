import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { invalidateLedgerCache } from "@/lib/query-keys";
import { useMutationStore } from "@/lib/store/mutation-state";
import { toast } from "sonner";

// Type for snapshot data returned by onOptimisticUpdate
export type MutationSnapshot = [QueryKey, unknown][];

export interface UseLedgerMutationOptions<TData, TVariables, TContext = unknown> {
  /**
   * The mutation function to execute
   */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /**
   * Success toast message (set to null to disable)
   */
  successMessage?: string | null;

  /**
   * Error toast message (set to null to disable)
   */
  errorMessage?: string | null;

  /**
   * Optional function to perform optimistic updates.
   * Should modify queryClient cache directly and return context for rollback.
   * Return { snapshots: MutationSnapshot } to enable automatic rollback,
   * or return any custom context for manual rollback.
   */
  onOptimisticUpdate?: (
    queryClient: ReturnType<typeof useQueryClient>,
    variables: TVariables
  ) => TContext | Promise<TContext>;

  /**
   * Optional function for custom rollback logic.
   * Only needed if not using the standard snapshot pattern.
   * If onOptimisticUpdate returns { snapshots }, this is not needed.
   */
  onRollback?: (
    queryClient: ReturnType<typeof useQueryClient>,
    context: TContext | undefined
  ) => void;

  /**
   * Additional callback to run on success (e.g., close modal, clear selection)
   */
  onSuccessExtra?: (data: TData, variables: TVariables, context: TContext | undefined) => void;

  /**
   * Additional callback to run on error
   */
  onErrorExtra?: (error: Error, variables: TVariables) => void;

  /**
   * Callback to run after invalidation is complete in onSettled.
   * Use this for additional invalidations or side effects.
   */
  onSettledExtra?: (
    queryClient: ReturnType<typeof useQueryClient>,
    variables: TVariables,
    data: TData | undefined,
    error: Error | null
  ) => void;

  /**
   * Override default invalidation behavior.
   * By default, invalidates all queries related to the ledger.
   */
  customInvalidation?: (queryClient: ReturnType<typeof useQueryClient>) => void;

  /**
   * Whether to skip default ledger cache invalidation.
   * Set to true if using customInvalidation or onSettledExtra for invalidation.
   */
  skipInvalidation?: boolean;
}

/**
 * Check if context contains standard snapshots for automatic rollback
 */
interface SnapshotContext {
  snapshots: MutationSnapshot;
}

function hasSnapshots(context: unknown): context is SnapshotContext {
  return (
    typeof context === "object" &&
    context !== null &&
    "snapshots" in context &&
    Array.isArray((context as SnapshotContext).snapshots)
  );
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
 * Supports two rollback patterns:
 * 1. Standard: onOptimisticUpdate returns { snapshots: MutationSnapshot } - automatic rollback
 * 2. Custom: onOptimisticUpdate returns any context + provide onRollback function
 *
 * @param ledgerId - The ledger ID for scoped cache invalidation
 * @param options - Mutation configuration
 */
export function useLedgerMutation<TData = unknown, TVariables = void, TContext = unknown>(
  ledgerId: string | null | undefined,
  options: UseLedgerMutationOptions<TData, TVariables, TContext>
) {
  const queryClient = useQueryClient();
  const { incrementLedgerMutation, decrementLedgerMutation } = useMutationStore();

  const {
    mutationFn,
    onOptimisticUpdate,
    onRollback,
    successMessage,
    errorMessage,
    skipInvalidation = false,
    customInvalidation,
    onSuccessExtra,
    onErrorExtra,
    onSettledExtra,
  } = options;

  return useMutation<TData, Error, TVariables, TContext>({
    mutationFn,

    onMutate: async (variables) => {
      // Increment mutation counter to pause polling for this ledger
      if (ledgerId) incrementLedgerMutation(ledgerId);

      // Cancel outgoing queries to prevent race conditions
      if (ledgerId) {
        await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
      }

      // Perform optimistic update if provided
      if (onOptimisticUpdate) {
        return await onOptimisticUpdate(queryClient, variables);
      }

      // When onOptimisticUpdate is not provided, return undefined.
      // The generic TContext will be unknown in this case, so the cast is safe.
      return undefined as unknown as TContext;
    },

    onSuccess: (data, variables, context) => {
      // Show success toast if message provided
      if (successMessage !== null && successMessage !== undefined) {
        toast.success(successMessage);
      }

      // Run additional success callback
      if (onSuccessExtra) {
        onSuccessExtra(data, variables, context);
      }
    },

    onError: (error, variables, context) => {
      // Rollback optimistic updates if provided
      if (context !== undefined) {
        // Pattern 1: Standard snapshots - automatic rollback
        if (hasSnapshots(context)) {
          context.snapshots.forEach(([queryKey, data]) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        // Pattern 2: Custom rollback function
        else if (onRollback) {
          onRollback(queryClient, context);
        }
      }

      // Show error toast if message provided
      if (errorMessage !== null && errorMessage !== undefined) {
        toast.error(errorMessage);
      }

      // Run additional error callback
      if (onErrorExtra) {
        onErrorExtra(error, variables);
      }
    },

    onSettled: async (data, error, variables) => {
      try {
        // Only invalidate queries if the mutation doesn't return data
        // or if skipInvalidation is false. When mutation returns data,
        // onSuccessExtra should handle cache updates directly.
        if (!skipInvalidation && !error && data === undefined) {
          if (customInvalidation) {
            customInvalidation(queryClient);
          } else if (ledgerId) {
            await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
          }
        }

        // Run additional settled callback
        if (onSettledExtra) {
          onSettledExtra(queryClient, variables, data, error);
        }
      } finally {
        // Always decrement, even if there was an error
        if (ledgerId) decrementLedgerMutation(ledgerId);
      }
    },
  });
}

/**
 * Helper to create standard snapshots for list operations.
 * Captures all queries matching the given queryKey pattern.
 */
export function createListSnapshots<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey
): MutationSnapshot {
  return queryClient.getQueriesData<T>({ queryKey });
}

/**
 * Helper for standard list item deletion optimistic update.
 * Returns snapshots for automatic rollback.
 */
export function optimisticallyDeleteFromList<T extends { id: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey,
  idToDelete: string
): { snapshots: MutationSnapshot } {
  const snapshots = createListSnapshots<T[]>(queryClient, queryKey);

  queryClient.setQueriesData<T[]>({ queryKey }, (old) =>
    old?.filter((item) => item.id !== idToDelete) ?? []
  );

  return { snapshots };
}

/**
 * Helper for standard list item addition optimistic update.
 * Returns snapshots for automatic rollback.
 */
export function optimisticallyAddToList<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey,
  newItem: T
): { snapshots: MutationSnapshot } {
  const snapshots = createListSnapshots<T[]>(queryClient, queryKey);

  queryClient.setQueriesData<T[]>({ queryKey }, (old) => [...(old ?? []), newItem]);

  return { snapshots };
}

/**
 * Helper for standard list item update optimistic update.
 * Returns snapshots for automatic rollback.
 */
export function optimisticallyUpdateInList<T extends { id: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey,
  idToUpdate: string,
  updates: Partial<T>
): { snapshots: MutationSnapshot } {
  const snapshots = createListSnapshots<T[]>(queryClient, queryKey);

  queryClient.setQueriesData<T[]>({ queryKey }, (old) =>
    old?.map((item) => (item.id === idToUpdate ? { ...item, ...updates } : item)) ?? []
  );

  return { snapshots };
}

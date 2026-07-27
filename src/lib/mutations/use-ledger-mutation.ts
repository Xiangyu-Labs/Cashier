import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

// Kept for compatibility with cache helper tests and non-persistent draft helpers.
export type MutationSnapshot = [QueryKey, unknown][];
type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

async function runPredicates(
  queryClient: ReturnType<typeof useQueryClient>,
  method: "cancelQueries" | "invalidateQueries",
  predicates: QueryPredicate[]
) {
  await Promise.all(
    predicates.map(async (predicate) => {
      await queryClient[method]({ predicate });
    })
  );
}

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

  /** @deprecated Persistent mutations no longer apply optimistic server results. */
  onOptimisticUpdate?: (
    queryClient: ReturnType<typeof useQueryClient>,
    variables: TVariables
  ) => TContext | undefined | Promise<TContext | undefined>;

  /** @deprecated Persistent mutations no longer need cache rollback. */
  onRollback?: (queryClient: ReturnType<typeof useQueryClient>, context: TContext) => void;

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
   * Query predicates to cancel in onMutate.
   */
  cancelPredicates?: QueryPredicate[];

  /**
   * Query predicates to invalidate after a successful mutation.
   * No query is invalidated unless the mutation explicitly names affected resources.
   */
  invalidatePredicates?: QueryPredicate[];

  /**
   * Optional function to run custom invalidation work after the default predicates.
   */
  customInvalidation?: (queryClient: ReturnType<typeof useQueryClient>) => void | Promise<void>;

  /**
   * Whether to skip default predicate invalidation.
   */
  skipInvalidation?: boolean;
}

/**
 * Generic mutation hook for ledger-related operations.
 * Handles the common pattern of:
 * 1. Preserve cached server data while the request is pending.
 * 2. Refresh explicitly affected queries after a successful response.
 * 3. Show feedback and run UI callbacks only after refresh completes.
 *
 * @param ledgerId - The ledger ID for scoped cache invalidation
 * @param options - Mutation configuration
 */
export function useLedgerMutation<TData = unknown, TVariables = void, TContext = unknown>(
  ledgerId: string | null | undefined,
  options: UseLedgerMutationOptions<TData, TVariables, TContext>
) {
  const queryClient = useQueryClient();

  const {
    mutationFn,
    successMessage,
    errorMessage,
    skipInvalidation = false,
    cancelPredicates,
    invalidatePredicates,
    customInvalidation,
    onSuccessExtra,
    onErrorExtra,
    onSettledExtra,
  } = options;

  return useMutation<TData, Error, TVariables, TContext | undefined>({
    mutationFn,

    onMutate: async (_variables) => {
      // Cancel outgoing queries to prevent race conditions
      if (ledgerId != null && cancelPredicates != null && cancelPredicates.length > 0) {
        await runPredicates(queryClient, "cancelQueries", cancelPredicates);
      }

      // Server-backed cache data is intentionally left unchanged until success.
      return undefined;
    },

    onSuccess: async (data, variables, context) => {
      if (!skipInvalidation) {
        if (ledgerId != null && invalidatePredicates != null && invalidatePredicates.length > 0) {
          await runPredicates(queryClient, "invalidateQueries", invalidatePredicates);
        }
        if (customInvalidation != null) {
          await customInvalidation(queryClient);
        }
      }

      // Show success toast if message provided
      if (successMessage !== null && successMessage !== undefined) {
        toast.success(successMessage);
      }

      // Run additional success callback
      if (onSuccessExtra) {
        onSuccessExtra(data, variables, context);
      }
    },

    onError: (error, variables) => {
      // Show error toast if message provided
      if (errorMessage !== null && errorMessage !== undefined) {
        toast.error(errorMessage);
      }

      // Run additional error callback
      if (onErrorExtra) {
        onErrorExtra(error, variables);
      }
    },

    onSettled: (data, error, variables) => {
      // Run additional settled callback
      if (onSettledExtra) {
        onSettledExtra(queryClient, variables, data, error);
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

  queryClient.setQueriesData<T[]>(
    { queryKey },
    (old) => old?.filter((item) => item.id !== idToDelete) ?? []
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

  queryClient.setQueriesData<T[]>(
    { queryKey },
    (old) => old?.map((item) => (item.id === idToUpdate ? { ...item, ...updates } : item)) ?? []
  );

  return { snapshots };
}

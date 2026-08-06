import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
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

  /**
   * Additional callback to run on success (e.g., close modal, clear selection)
   */
  onSuccessExtra?: (data: TData, variables: TVariables, context: TContext | undefined) => void;

  /**
   * Additional callback to run on error
   */
  onErrorExtra?: (error: Error, variables: TVariables) => void;

  /**
   * Callback invoked by React Query's onSettled once the mutation settles,
   * for both success and error. It does not wait for background cache
   * invalidation, so it is safe to use for failure recovery such as
   * re-fetching affected queries.
   */
  onMutationSettled?: (
    queryClient: QueryClient,
    variables: TVariables,
    data: TData | undefined,
    error: Error | null
  ) => void | Promise<void>;

  /**
   * Callback invoked after the background cache refresh triggered by a
   * successful mutation finishes (including custom invalidation). Receives
   * the refresh error, or null when the refresh succeeded. The mutation stays
   * successful even when the refresh fails.
   */
  onRefreshSettled?: (
    queryClient: QueryClient,
    variables: TVariables,
    refreshError: unknown | null
  ) => void | Promise<void>;

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
 * 2. Refresh explicitly affected queries in the background after a successful
 *    response; a failed refresh never rejects the mutation.
 * 3. Show feedback and run UI callbacks as soon as the business write succeeds.
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
    onMutationSettled,
    onRefreshSettled,
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

    onSuccess: (data, variables, context) => {
      // Cache refresh is recoverable post-write work: the mutation already
      // succeeded at the business layer, so a failed invalidation must never
      // reject the mutation or change its success status.
      void refreshCacheInBackground(queryClient, variables, {
        ledgerId,
        skipInvalidation,
        invalidatePredicates,
        customInvalidation,
        onRefreshSettled,
      });

      // Show success toast if message provided
      if (successMessage !== null && successMessage !== undefined) {
        toast.success(successMessage);
      }

      // Run additional success callback
      if (onSuccessExtra) {
        onSuccessExtra(data, variables, context);
      }
      if (ledgerId != null && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cashier:ledger-mutated", { detail: ledgerId }));
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

    onSettled: async (data, error, variables) => {
      if (onMutationSettled == null) return;
      try {
        await onMutationSettled(queryClient, variables, data, error);
      } catch (settledError) {
        console.error("[useLedgerMutation] post-mutation callback failed", {
          ledgerId,
          error: settledError,
        });
      }
    },
  });
}

async function refreshCacheInBackground<TVariables>(
  queryClient: QueryClient,
  variables: TVariables,
  options: {
    ledgerId: string | null | undefined;
    skipInvalidation: boolean;
    invalidatePredicates: QueryPredicate[] | undefined;
    customInvalidation: ((queryClient: QueryClient) => void | Promise<void>) | undefined;
    onRefreshSettled:
      | ((
          queryClient: QueryClient,
          variables: TVariables,
          refreshError: unknown | null
        ) => void | Promise<void>)
      | undefined;
  }
): Promise<void> {
  let refreshError: unknown = null;
  try {
    if (!options.skipInvalidation) {
      if (
        options.ledgerId != null &&
        options.invalidatePredicates != null &&
        options.invalidatePredicates.length > 0
      ) {
        await runPredicates(queryClient, "invalidateQueries", options.invalidatePredicates);
      }
      if (options.customInvalidation != null) {
        await options.customInvalidation(queryClient);
      }
    }
  } catch (error) {
    refreshError = error;
    console.error(
      "[useLedgerMutation] background cache invalidation failed after a successful mutation",
      { ledgerId: options.ledgerId, error }
    );
  } finally {
    if (options.onRefreshSettled != null) {
      try {
        await options.onRefreshSettled(queryClient, variables, refreshError);
      } catch (callbackError) {
        console.error("[useLedgerMutation] refresh completion callback failed", {
          ledgerId: options.ledgerId,
          error: callbackError,
        });
      }
    }
  }
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

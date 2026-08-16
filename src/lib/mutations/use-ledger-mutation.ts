import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { runBackgroundQueryRefresh, type RefreshFailureMode } from "./background-query-refresh";

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
      if (method === "invalidateQueries") {
        await queryClient.invalidateQueries({ predicate }, { throwOnError: true });
      } else {
        await queryClient.cancelQueries({ predicate });
      }
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
   * Warning shown when the write succeeds but a declared cache refresh fails.
   */
  refreshFailureMessage?: string | null;

  /**
   * How a failed background cache refresh is surfaced after a successful write.
   * "warning" shows a toast; "log-only" records the error without showing a
   * conflicting warning right after the success toast.
   */
  refreshFailureMode?: RefreshFailureMode;

  /**
   * Applies the authoritative server response before affected queries refresh.
   * This must not synthesize client-side data the server did not return.
   */
  onSuccessReconcile?: (
    queryClient: QueryClient,
    data: TData,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;

  /**
   * UI completion callback run immediately after authoritative reconciliation,
   * before the background cache refresh starts.
   */
  onWriteSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;

  /**
   * Additional callback to run on error
   */
  onErrorExtra?: (error: Error, variables: TVariables) => void;

  /**
   * Callback invoked by React Query's onSettled once the mutation settles,
   * for both success and error. On success this runs once the server write,
   * authoritative reconciliation and the immediate UI completion callback have
   * finished; it does NOT wait for the background cache refresh to settle. On
   * failure, it can be used for recovery work such as re-fetching affected queries.
   */
  onMutationSettled?: (
    queryClient: QueryClient,
    variables: TVariables,
    data: TData | undefined,
    error: Error | null
  ) => void | Promise<void>;

  /**
   * Callback invoked after the cache refresh triggered by a successful
   * mutation finishes (including custom invalidation). Receives
   * the refresh error, or null when the refresh succeeded. The mutation stays
   * successful even when the refresh fails. Always called from the detached
   * background refresh task, never from the synchronous completion path.
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
 * 2. Apply authoritative reconciliation, then run the immediate UI completion
 *    callback. Release pending state as soon as these finish.
 * 3. Start the declared cache invalidation in the background. Keep a successful
 *    write successful when refresh work fails, warn the user (or just log), and
 *    release UI locks after the immediate completion callbacks run.
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
    refreshFailureMessage,
    refreshFailureMode,
    skipInvalidation = false,
    cancelPredicates,
    invalidatePredicates,
    customInvalidation,
    onSuccessReconcile,
    onWriteSuccess,
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

    onSuccess: async (data, variables, context) => {
      // Apply authoritative reconciliation from the server response. This
      // must not synthesize client-side data the server did not return.
      if (onSuccessReconcile != null) {
        try {
          await onSuccessReconcile(queryClient, data, variables, context);
        } catch (error) {
          console.error("[useLedgerMutation] authoritative reconciliation failed", {
            ledgerId,
            error,
          });
        }
      }

      // Run the immediate UI completion callback. Neither this nor a failed
      // background refresh can turn a successful write back into an error.
      await runPostWriteCallback("write completion callback", ledgerId, () =>
        onWriteSuccess?.(data, variables, context)
      );

      if (successMessage !== null && successMessage !== undefined) {
        toast.success(successMessage);
      }
      if (ledgerId != null && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cashier:ledger-mutated", { detail: ledgerId }));
      }

      // Start the background invalidation / custom refresh and return
      // immediately so mutateAsync, isPending and onMutationSettled do not wait
      // for the query refetch to finish.
      runBackgroundQueryRefresh({
        ledgerId,
        label: "cache refresh",
        ...(refreshFailureMessage !== undefined ? { failureMessage: refreshFailureMessage } : {}),
        ...(refreshFailureMode !== undefined ? { failureMode: refreshFailureMode } : {}),
        refresh: () =>
          refreshCache(queryClient, {
            ledgerId,
            skipInvalidation,
            invalidatePredicates,
            customInvalidation,
          }),
        onSettled: (refreshError) => onRefreshSettled?.(queryClient, variables, refreshError),
      });
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

async function refreshCache(
  queryClient: QueryClient,
  options: {
    ledgerId: string | null | undefined;
    skipInvalidation: boolean;
    invalidatePredicates: QueryPredicate[] | undefined;
    customInvalidation: ((queryClient: QueryClient) => void | Promise<void>) | undefined;
  }
): Promise<void> {
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
}

async function runPostWriteCallback(
  label: string,
  ledgerId: string | null | undefined,
  callback: () => void | Promise<void> | undefined
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    console.error(`[useLedgerMutation] ${label} failed`, {
      ledgerId,
      error,
    });
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

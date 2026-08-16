import { toast } from "sonner";

export type RefreshFailureMode = "warning" | "log-only";

export interface RunBackgroundQueryRefreshOptions {
  /**
   * The cache-refresh work to run in the background. Exceptions thrown here
   * are captured by the executor and reported according to `failureMode`.
   */
  refresh: () => void | Promise<void>;
  /**
   * Ledger ID used to scope the error log.
   */
  ledgerId: string | null | undefined;
  /**
   * Short label describing the refresh work, used in the error log.
   */
  label: string;
  /**
   * Warning shown when `failureMode` is "warning" and the refresh fails.
   */
  failureMessage?: string | null;
  /**
   * How a refresh failure is surfaced. Defaults to "warning".
   */
  failureMode?: RefreshFailureMode;
  /**
   * Optional callback invoked after the refresh settles with the refresh
   * error (or null). Exceptions here are captured as well.
   */
  onSettled?: (refreshError: unknown | null) => void | Promise<void>;
}

/**
 * Run a cache refresh in the background after a successful write.
 *
 * The caller does not wait on this function: it returns immediately and the
 * refresh work (plus the optional `onSettled` callback) runs detached. Every
 * failure path is captured internally, so this never produces an unhandled
 * promise rejection and can never turn a successful write into an error.
 */
export function runBackgroundQueryRefresh({
  refresh,
  ledgerId,
  label,
  failureMessage,
  failureMode = "warning",
  onSettled,
}: RunBackgroundQueryRefreshOptions): void {
  void (async () => {
    let refreshError: unknown = null;
    try {
      await refresh();
    } catch (error) {
      refreshError = error;
      console.error(`[background-query-refresh] ${label} failed`, { ledgerId, error });
      if (failureMode === "warning" && failureMessage != null) {
        toast.warning(failureMessage);
      }
    }
    if (onSettled != null) {
      try {
        await onSettled(refreshError);
      } catch (error) {
        console.error(`[background-query-refresh] ${label} onSettled callback failed`, {
          ledgerId,
          error,
        });
      }
    }
  })();
}

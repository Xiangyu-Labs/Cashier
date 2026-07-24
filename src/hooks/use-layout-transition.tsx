import { useId } from "react";

/**
 * Hook to manage layout transitions for the ledger entries.
 * Simplified to return no-op props after Framer Motion removal.
 * This hook may be fully removed in a future refactor.
 */
export function useLayoutTransition() {
  useId(); // Keep the call for stability if restructured later

  return {
    containerProps: {},
    getItemProps: () => ({}),
    layoutGroupId: "legacy-layout",
  };
}

/**
 * Hook to manage layout transitions for the ledger entries.
 * Simplified to return no-op props after Framer Motion removal.
 * This hook may be fully removed in a future refactor.
 */
export function useLayoutTransition() {
  return {
    containerProps: {} as Record<string, unknown>,
    getItemProps: () => ({}) as Record<string, unknown>,
    layoutGroupId: "legacy-layout" as string,
  };
}

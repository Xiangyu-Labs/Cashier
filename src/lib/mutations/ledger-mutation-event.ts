export type LedgerMutationReason = "create" | "update" | "delete" | "batch" | "settings";

export interface LedgerMutationEventDetail {
  ledgerId: string;
  reason: LedgerMutationReason;
}

export const LEDGER_MUTATION_EVENT = "cashier:ledger-mutated";

export function dispatchLedgerMutationEvent(detail: LedgerMutationEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LedgerMutationEventDetail>(LEDGER_MUTATION_EVENT, { detail })
  );
}

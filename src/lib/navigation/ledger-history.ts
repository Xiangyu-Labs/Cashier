"use client";

export type LedgerNavigationKind = "tab" | "filter" | "stats" | "drilldown" | "detail";

interface CashierHistoryMetadata {
  cashier?: {
    ledgerNavigation: true;
    kind: LedgerNavigationKind;
    sequence: number;
  };
}

function currentSequence(): number {
  const cashier = (window.history.state as CashierHistoryMetadata | null)?.cashier;
  return cashier?.ledgerNavigation === true && Number.isInteger(cashier.sequence)
    ? cashier.sequence
    : 0;
}

function currentCustomHistoryState(): Record<string, unknown> {
  const state = window.history.state;
  if (state == null || typeof state !== "object" || Array.isArray(state)) {
    return {};
  }

  const customState = { ...(state as Record<string, unknown>) };
  delete customState.__NA;
  delete customState._N;
  delete customState.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return customState;
}

export function writeLedgerHistory(
  method: "push" | "replace",
  url: string,
  kind: LedgerNavigationKind
): void {
  const sequence = method === "push" ? currentSequence() + 1 : currentSequence();
  const state: Record<string, unknown> & CashierHistoryMetadata = {
    ...currentCustomHistoryState(),
    cashier: { ledgerNavigation: true, kind, sequence },
  };
  if (method === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
}

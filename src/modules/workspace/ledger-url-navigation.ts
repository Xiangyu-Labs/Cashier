"use client";
import { buildLedgerUrl } from "./ledger-url-params";

type SearchParamsLike = Pick<URLSearchParams, "toString">;
export type LedgerNavigationKind = "tab" | "filter" | "stats" | "drilldown" | "detail";

interface CashierHistoryMetadata {
  cashier?: {
    ledgerNavigation: true;
    kind: LedgerNavigationKind;
  };
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

export function pushLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams,
  kind: LedgerNavigationKind
): string {
  const url = buildLedgerUrl(pathname, searchParams);
  const state: Record<string, unknown> & CashierHistoryMetadata = {
    ...currentCustomHistoryState(),
    cashier: { ledgerNavigation: true, kind },
  };
  window.history.pushState(state, "", url);
  return url;
}

export function replaceLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams
): string {
  const url = buildLedgerUrl(pathname, searchParams);
  window.history.replaceState(currentCustomHistoryState(), "", url);
  return url;
}

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

function currentHistoryState(): Record<string, unknown> {
  const state = window.history.state;
  return state != null && typeof state === "object" ? state : {};
}

export function pushLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams,
  kind: LedgerNavigationKind
): string {
  const url = buildLedgerUrl(pathname, searchParams);
  const state: Record<string, unknown> & CashierHistoryMetadata = {
    ...currentHistoryState(),
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
  window.history.replaceState(currentHistoryState(), "", url);
  return url;
}

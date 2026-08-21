"use client";
import {
  buildLedgerUrl,
  readLedgerDetailSearchParams,
  setLedgerDetailSearchParams,
} from "./ledger-url-params";

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
  const leavingDetail =
    kind !== "detail" &&
    readLedgerDetailSearchParams(new URLSearchParams(window.location.search)) != null;
  const nextSearchParams =
    kind === "detail"
      ? searchParams
      : setLedgerDetailSearchParams(new URLSearchParams(searchParams.toString()), null);
  const url = buildLedgerUrl(pathname, nextSearchParams);
  const state: Record<string, unknown> & CashierHistoryMetadata = {
    ...currentCustomHistoryState(),
    cashier: { ledgerNavigation: true, kind },
  };
  if (leavingDetail) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);
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

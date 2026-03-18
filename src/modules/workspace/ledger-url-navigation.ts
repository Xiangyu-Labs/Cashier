"use client";

import { startTransition } from "react";
import { buildLedgerUrl } from "./ledger-url-params";

interface LedgerRouterLike {
  replace: (url: string, options: { scroll: false }) => void;
}

type SearchParamsLike = Pick<URLSearchParams, "toString">;

export function replaceLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams
): string {
  const url = buildLedgerUrl(pathname, searchParams);
  window.history.replaceState(null, "", url);
  return url;
}

export function replaceAndNavigateLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams,
  router: LedgerRouterLike
): string {
  const url = replaceLedgerUrl(pathname, searchParams);
  startTransition(() => {
    router.replace(url, { scroll: false });
  });
  return url;
}

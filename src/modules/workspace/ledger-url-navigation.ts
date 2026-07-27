"use client";
import { buildLedgerUrl } from "./ledger-url-params";

type SearchParamsLike = Pick<URLSearchParams, "toString">;

export function replaceLedgerUrl(
  pathname: string,
  searchParams: SearchParamsLike | URLSearchParams
): string {
  const url = buildLedgerUrl(pathname, searchParams);
  window.history.replaceState(null, "", url);
  return url;
}

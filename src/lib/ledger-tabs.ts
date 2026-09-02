const LEDGER_TABS = ["stream", "details", "stats", "settings"] as const;

export type LedgerTab = (typeof LEDGER_TABS)[number];

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type SearchParamsLike = URLSearchParams | SearchParamsRecord | Pick<URLSearchParams, "get">;

function hasGetMethod(
  searchParams: SearchParamsLike
): searchParams is URLSearchParams | Pick<URLSearchParams, "get"> {
  return typeof (searchParams as { get?: unknown }).get === "function";
}

function getTabValue(searchParams: SearchParamsLike): string | null {
  if (hasGetMethod(searchParams)) {
    return searchParams.get("tab");
  }

  const value = searchParams.tab;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function isLedgerTab(value: string | null | undefined): value is LedgerTab {
  return value != null && LEDGER_TABS.includes(value as LedgerTab);
}

export function parseLedgerTab(
  searchParams: SearchParamsLike,
  fallback: LedgerTab = "stream"
): LedgerTab {
  const value = getTabValue(searchParams);
  return isLedgerTab(value) ? value : fallback;
}

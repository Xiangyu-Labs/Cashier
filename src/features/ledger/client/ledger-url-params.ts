export interface LedgerFilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
}

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

interface LedgerUrlUpdate {
  tab?: string | null;
  period?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

function createMutableSearchParams(searchParams: SearchParamsLike): URLSearchParams {
  return new URLSearchParams(searchParams.toString());
}

function setOrDeleteStringParam(
  params: URLSearchParams,
  key: keyof LedgerUrlUpdate,
  value: string | null | undefined
) {
  if (value == null || value === "" || value === "__uncategorized__") {
    params.delete(key);
    return;
  }

  params.set(key, value);
}

function setOrDeleteNumberParam(
  params: URLSearchParams,
  key: "minAmount" | "maxAmount",
  value: number | null | undefined
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    params.delete(key);
    return;
  }

  params.set(key, String(value));
}

export function readLedgerFilterParams(searchParams: SearchParamsLike): LedgerFilterParams {
  const readNumber = (key: "minAmount" | "maxAmount"): number | null => {
    const raw = searchParams.get(key);
    if (raw == null) return null;

    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    categoryId: searchParams.get("categoryId") ?? null,
    currency: searchParams.get("currency") ?? null,
    minAmount: readNumber("minAmount"),
    maxAmount: readNumber("maxAmount"),
  };
}

export function updateLedgerSearchParams(
  searchParams: SearchParamsLike,
  updates: LedgerUrlUpdate
): URLSearchParams {
  const params = createMutableSearchParams(searchParams);

  if ("tab" in updates) setOrDeleteStringParam(params, "tab", updates.tab);
  if ("period" in updates) {
    setOrDeleteStringParam(params, "period", updates.period);

    if (updates.period !== "custom") {
      params.delete("startDate");
      params.delete("endDate");
    }
  }

  if ((updates.period === "custom") || (!("period" in updates) && ("startDate" in updates || "endDate" in updates))) {
    if ("startDate" in updates) setOrDeleteStringParam(params, "startDate", updates.startDate);
    if ("endDate" in updates) setOrDeleteStringParam(params, "endDate", updates.endDate);
  }

  if ("categoryId" in updates) setOrDeleteStringParam(params, "categoryId", updates.categoryId);
  if ("currency" in updates) setOrDeleteStringParam(params, "currency", updates.currency);
  if ("minAmount" in updates) setOrDeleteNumberParam(params, "minAmount", updates.minAmount);
  if ("maxAmount" in updates) setOrDeleteNumberParam(params, "maxAmount", updates.maxAmount);

  return params;
}

export function buildLedgerUrl(pathname: string, searchParams: SearchParamsLike | URLSearchParams): string {
  const query = searchParams.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

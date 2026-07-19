import type { SourceDocumentStatusType } from "@/modules/source-document/types";

export const STATUSES_URL_PARAM = "statuses";
const STATUSES_URL_DELIMITER = ",";

/**
 * Canonical status order for URL serialization.
 * Mirrors SOURCE_DOCUMENT_STATUSES order for stable, predictable encoding.
 */
const CANONICAL_STATUS_ORDER: readonly SourceDocumentStatusType[] = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
  "deleted",
  "candidate_pending",
];

/**
 * Parse a comma-delimited statuses URL parameter into a validated, deduplicated,
 * canonically ordered array. Invalid tokens are silently ignored.
 * Returns an empty array when the parameter is absent, empty, or contains no
 * valid tokens (empty array = all statuses, i.e. no status filtering).
 */
export function parseStatusesParam(raw: string | null): SourceDocumentStatusType[] {
  if (raw == null || raw === "") return [];

  const tokenSet = new Set<SourceDocumentStatusType>();
  const rawTokens = raw.split(STATUSES_URL_DELIMITER);

  for (const token of rawTokens) {
    const trimmed = token.trim();
    if (trimmed === "") continue;
    if ((CANONICAL_STATUS_ORDER as readonly string[]).includes(trimmed)) {
      tokenSet.add(trimmed as SourceDocumentStatusType);
    }
  }

  // Return in canonical order, preserving only known valid tokens
  return CANONICAL_STATUS_ORDER.filter((s) => tokenSet.has(s));
}

/**
 * Serialize a statuses array to a comma-delimited string suitable for URL use.
 * Returns null when the array is empty (parameter should be omitted).
 * The input is already assumed to be canonical; duplicates are removed defensively.
 */
export function formatStatusesParam(statuses: SourceDocumentStatusType[]): string | null {
  if (statuses.length === 0) return null;

  // Deduplicate while preserving canonical order
  const unique = CANONICAL_STATUS_ORDER.filter((s) => statuses.includes(s));

  if (unique.length === 0) return null;

  return unique.join(STATUSES_URL_DELIMITER);
}

export interface LedgerFilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  statuses: SourceDocumentStatusType[];
}

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;
type SearchParamsStringLike = Pick<URLSearchParams, "toString">;

export interface LedgerUrlUpdate {
  tab?: string | null;
  period?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  statuses?: SourceDocumentStatusType[] | null;
}

function createMutableSearchParams(searchParams: SearchParamsLike): URLSearchParams {
  return new URLSearchParams(searchParams.toString());
}

function setOrDeleteStringParam(
  params: URLSearchParams,
  key: keyof LedgerUrlUpdate,
  value: string | null | undefined
) {
  const isEmpty = value == null || value === "";

  if (isEmpty) {
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
    statuses: parseStatusesParam(searchParams.get(STATUSES_URL_PARAM)),
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

  if (
    updates.period === "custom" ||
    (!("period" in updates) && ("startDate" in updates || "endDate" in updates))
  ) {
    if ("startDate" in updates) setOrDeleteStringParam(params, "startDate", updates.startDate);
    if ("endDate" in updates) setOrDeleteStringParam(params, "endDate", updates.endDate);
  }

  if ("categoryId" in updates) setOrDeleteStringParam(params, "categoryId", updates.categoryId);
  if ("currency" in updates) setOrDeleteStringParam(params, "currency", updates.currency);
  if ("minAmount" in updates) setOrDeleteNumberParam(params, "minAmount", updates.minAmount);
  if ("maxAmount" in updates) setOrDeleteNumberParam(params, "maxAmount", updates.maxAmount);

  if ("statuses" in updates) {
    const formatted = updates.statuses != null ? formatStatusesParam(updates.statuses) : null;
    if (formatted != null) {
      params.set(STATUSES_URL_PARAM, formatted);
    } else {
      params.delete(STATUSES_URL_PARAM);
    }
  }

  params.delete("search");

  return params;
}

export function buildLedgerUrl(
  pathname: string,
  searchParams: SearchParamsStringLike | URLSearchParams
): string {
  const query = searchParams.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

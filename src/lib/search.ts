export const MAX_SEARCH_LENGTH = 100;

export function normalizeSearchTerm(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
  return normalized === "" ? undefined : normalized;
}

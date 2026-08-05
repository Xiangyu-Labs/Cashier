export interface DuplicateReasonNormalizationInput {
  reason: string | null | undefined;
  aiLanguage?: string;
  currentSourceDocumentId: string;
  candidateSourceDocumentIds: readonly string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function documentIdPattern(id: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegExp(id)}(?![\\p{L}\\p{N}_-])`, "giu");
}

const INTERNAL_DUPLICATE_LABEL_PATTERN = /\b(?:CURRENT|CANDIDATE(?:[_\s-]?\d+)?)\b/giu;
const INTERNAL_DOCUMENT_DESCRIPTOR_PATTERN = /\b(?:SOURCE\s+)?DOCUMENT\s+ID\s*[:=]?\s*/giu;
const INTERNAL_DUPLICATE_LABEL_CHECK = /\b(?:CURRENT|CANDIDATE(?:[_\s-]?\d+)?)\b/iu;

function duplicateReasonFallback(aiLanguage?: string): string {
  return aiLanguage?.trim().toLocaleLowerCase().startsWith("zh")
    ? "账单内容、金额和日期高度一致，疑似为同一笔消费。"
    : "The bill content, amount, and date closely match and may represent the same purchase.";
}

/**
 * Keeps useful comparison evidence while removing only the document IDs that
 * were actually included in the comparison prompt and internal comparison
 * labels from old persisted reasons.
 */
export function normalizeDuplicateReason({
  reason,
  aiLanguage,
  currentSourceDocumentId,
  candidateSourceDocumentIds,
}: DuplicateReasonNormalizationInput): string {
  const ids = [currentSourceDocumentId, ...candidateSourceDocumentIds].filter(
    (id, index, values) => id !== "" && values.indexOf(id) === index
  );
  const sanitized = ids
    .map(documentIdPattern)
    .reduce((value, pattern) => value.replace(pattern, ""), reason ?? "")
    .replace(INTERNAL_DUPLICATE_LABEL_PATTERN, "")
    .replace(INTERNAL_DOCUMENT_DESCRIPTOR_PATTERN, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?，。；：！？])/g, "$1")
    .trim();

  if (
    sanitized === "" ||
    ids.some((id) => documentIdPattern(id).test(sanitized)) ||
    INTERNAL_DUPLICATE_LABEL_CHECK.test(sanitized)
  ) {
    return duplicateReasonFallback(aiLanguage);
  }
  return sanitized;
}

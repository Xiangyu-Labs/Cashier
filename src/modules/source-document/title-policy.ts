/**
 * Shared AI title policy.
 *
 * Every stage that can produce a persisted title — main parse, second pass,
 * and arbitration — applies the same default style and the same normalization
 * rules, so the arbitration stage cannot bypass the ledger prompt or the hard
 * non-empty/length constraints.
 */

/** Hard maximum length for a persisted title, in Unicode code points. */
export const MAX_TITLE_LENGTH = 200;

/**
 * Normalize an AI-produced title: trim, collapse consecutive whitespace,
 * fall back when empty, and truncate at MAX_TITLE_LENGTH code points without
 * splitting surrogate pairs. Trailing whitespace introduced by truncation is
 * removed again.
 */
export function normalizeTitle(raw: string | null | undefined, fallback: string): string {
  const collapsed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (collapsed === "") return fallback;
  const truncated = Array.from(collapsed).slice(0, MAX_TITLE_LENGTH).join("");
  return truncated.trim();
}

/**
 * Prompt section stating the default title style and the instruction
 * priority. Highest priority is document facts and hard constraints; the
 * mandatory output locale comes second, the ledger owner's Additional
 * Instructions third, and the default merchant/service-first style last.
 */
export const TITLE_POLICY_PROMPT = `### Title Policy
- Default to a concise merchant- or service-first title (for example "Starbucks", "Didi ride", or "Alipay — Utility bill").
- Add a short qualifier (store branch, service type, or item category) only when it is needed to distinguish the document from other documents.
- Do not add amounts, dates, or payment status to the title by default.
- The title must be non-empty and at most 200 Unicode characters.
- Instruction priority (highest first):
  1. Facts and structure of the source document; the title must be non-empty and at most 200 Unicode characters.
  2. The mandatory output locale below.
  3. Additional Instructions from the ledger owner.
  4. The default merchant-/service-first style above.`;

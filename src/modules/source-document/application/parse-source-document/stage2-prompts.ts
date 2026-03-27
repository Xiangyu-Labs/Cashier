/**
 * Stage 2 Prompts
 *
 * Integrated prompt that absorbs former Stage 1 non-validity analysis and
 * Stage 1.5 consolidation. Stage 2 now owns: completeness check, currency
 * recognition, category assignment, title extraction, user requirement
 * interpretation, and final dual-run parsing with arbitration support.
 *
 * Can emit explicit "invalid" or "anomaly" outcomes in addition to "success".
 */

import type { DocumentUnderstanding } from "./types";

export interface Stage2PromptContext {
  documentUnderstanding?: DocumentUnderstanding;
  preferredCurrencies?: string[];
  categories: { name: string; description: string | null }[];
  aiCustomPrompt?: string;
  aiLanguage?: string;
}

export function buildDetailedParsePrompt(context: Stage2PromptContext): string {
  const lang = context.aiLanguage ?? "zh-CN";

  const categoryList =
    context.categories.length > 0
      ? context.categories
          .map((c, i) => `  ${i + 1}. ${c.name}${c.description ? ` — ${c.description}` : ""}`)
          .join("\n")
      : "  (no categories provided)";

  const preferredCurrencies =
    (context.preferredCurrencies?.length ?? 0) > 0
      ? `Preferred currencies: ${context.preferredCurrencies!.join(", ")}`
      : "No preferred currencies specified";

  const userRulesSection =
    context.aiCustomPrompt != null && context.aiCustomPrompt.trim() !== ""
      ? `\n### User-Defined Requirements\n${context.aiCustomPrompt}\n`
      : "";

  const evidenceSection =
    context.documentUnderstanding != null
      ? `\nThe document has already been analyzed by a vision model. Use the structured evidence below as your primary source of truth. Prioritize primary evidence over secondary evidence when resolving conflicts.`
      : ``;

  return `You are a detailed financial document parser. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

User's preferred output language: ${lang}${evidenceSection}

### Task

Analyze the financial document and either:
1. Parse it into structured ledger entries (outcome: "success")
2. Flag it as incomplete or ambiguous (outcome: "anomaly") with a clear reason

### Available Categories (use category_index in output, 1-based)
${categoryList}

### Currency Context
${preferredCurrencies}
${userRulesSection}
### Analysis Guidelines

**Completeness**: If no monetary amounts can be identified, set outcome: "anomaly".

**Currency**: Use ISO codes (CNY, USD, EUR). Match amounts to the currency symbol visible in the document. Use preferred currencies as a tiebreaker if ambiguous.

**Granularity by Nature**:
- Tangible goods (shopping, retail): preserve individual items as separate entries
- Services/meals/subscriptions: items can be merged when they form a unified experience
- When uncertain, prefer more granular entries

**Reasonable Inference**: When item details are partially hidden but total is known, create a single representative entry for the collapsed items. Never invent specific product names.

**Category Assignment**: Assign category_index from the list above. Use 0 only as a last resort when no other category fits at all. If an "Other" category exists, use it instead of 0.

**Title**: Extract a short title (≤20 chars, user's language) like "[Merchant] [Core Item(s)]".

**Primary Evidence First**: When primary and secondary evidence conflict, trust primary evidence.

### Required Output (JSON only, start your response with {)
\`\`\`
{
  "outcome": "success" | "anomaly",
  "anomaly_reason": "<only when outcome is anomaly>",
  "title": "<short document title>",
  "currencies": [{"code": "CNY", "hint": "main currency"}],
  "categories": [{"name": "Food", "hint": "matched from category list"}],
  "ledger_entries": [
    {
      "item_name": "Item description",
      "amount": 45.00,
      "currency": "CNY",
      "category_index": 1,
      "notes": "Optional note or null"
    }
  ],
  "reasoning": "Explanation of parsing decisions"
}
\`\`\`

When outcome is "anomaly": set anomaly_reason, and set ledger_entries to [].`;
}

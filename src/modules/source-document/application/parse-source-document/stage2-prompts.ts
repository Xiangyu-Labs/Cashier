/**
 * Stage 2 Prompts
 *
 * Detailed parsing prompts that use Stage 1.5 validation summary as context.
 */

import type { ValidationSummary } from "./types";

export function buildDetailedParsePrompt(
  validationSummary: ValidationSummary,
  originalCategories: { name: string; description: string | null }[],
  aiLanguage: string = "zh-CN"
): string {
  // Build context section from validation summary
  const currencyHints =
    validationSummary.summary?.currencies.map((c) => `- ${c.code}: ${c.hint}`).join("\n") ??
    "No currency hints";

  // Use original categories with correct indices (1-based)
  const categoryHints = originalCategories.map((c, index) => ({
    index: index + 1,
    name: c.name,
    description: c.description ?? "",
  }));
  const categoryHintsStr =
    categoryHints.length > 0 ? JSON.stringify(categoryHints, null, 2) : "No categories available";

  const rules = validationSummary.summary?.rules ?? [];
  const userRules = rules.length > 0
    ? `### User-Defined Rules\n${rules.map((r) => `- ${r}`).join("\n")}`
    : "";

  return `You are a detailed financial document parser. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Parse the financial document into structured ledger entries. Use the pre-analysis context provided.

### Pre-Analysis Context

**Title:** ${validationSummary.summary?.title ?? "Unknown"}

**Currencies:**
${currencyHints}

**Categories (use category_index in output):**
${categoryHintsStr}

${userRules}

### Context
- User's preferred language for output: ${aiLanguage}

### Core Parsing Principles

**Granularity by Nature**
Determine the appropriate level of detail based on the consumption type:
- For tangible goods (shopping, retail items): Preserve individual items as separate entries - each distinct product should have its own line
- For experiential services (meals, deliveries, subscriptions): Items can be merged when they form a unified experience
- When uncertain, prefer more granular detail over aggregation

**Conservation of Amount**
All extracted entries must sum to the total amount shown in the document:
- If a grand total is visible, the sum of all entry amounts must match it exactly
- When distributing discounts, fees, or adjustments across items, ensure the math remains consistent
- Round to 2 decimal places; if rounding creates discrepancies, adjust the largest item to compensate

**Reasonable Inference for Incomplete Data**
When item details are partially hidden or collapsed but the total is known:
- Create a single representative entry for the collapsed items using the most likely category
- Use descriptive names like "Other items (collapsed)" or similar
- Add a note indicating this entry represents multiple unspecified items
- Never invent specific product names for unknown items

### Rules
1. Extract EACH individual item as a separate entry (unless user rules specify merging)
2. Use the pre-identified currencies - only use other currencies if clearly different
3. Assign category_index from the pre-identified list. If the item truly cannot fit any specific category but a "其他" (Other) category exists in the list, assign its index — do NOT use 0. Reserve category_index 0 ONLY for when the category list is completely empty. "其他"/"Other" should be used as a last resort; always prefer any reasonable specific category match over it.
4. Amount must be positive numbers
5. Provide reasoning for any non-obvious parsing decisions

### Required output (JSON only, start your response with {)
{
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
}`;
}

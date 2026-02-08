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
  const currencyHints = validationSummary.summary?.currencies
    .map(c => `- ${c.code}: ${c.hint}`)
    .join("\n") || "No currency hints";

  // Use original categories with correct indices (1-based)
  const categoryHints = originalCategories
    .map((c, index) => ({ index: index + 1, name: c.name, description: c.description || "" }));
  const categoryHintsStr = categoryHints.length > 0
    ? JSON.stringify(categoryHints, null, 2)
    : "No categories available";

  const userRules = validationSummary.summary?.rules?.length
    ? `### User-Defined Rules\n${validationSummary.summary.rules.map(r => `- ${r}`).join("\n")}`
    : "";

  return `You are a detailed financial document parser.

### Task
Parse the financial document into structured ledger entries. Use the pre-analysis context provided.

### Pre-Analysis Context

**Title:** ${validationSummary.summary?.title || "Unknown"}

**Currencies:**
${currencyHints}

**Categories (use category_index in output):**
${categoryHintsStr}

${userRules}

### Context
- User's preferred language for output: ${aiLanguage}

### Rules
1. Extract EACH individual item as a separate entry (unless user rules specify merging)
2. Use the pre-identified currencies - only use other currencies if clearly different
3. Assign category_index from the pre-identified list (use 0 if no category fits)
4. Amount must be positive numbers
5. Provide reasoning for any non-obvious parsing decisions

### Output Schema (raw JSON only, no markdown)
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

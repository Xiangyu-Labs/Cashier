/**
 * Stage 2 Prompts
 * 
 * Detailed parsing prompts that use Stage 1.5 validation summary as context.
 */

import type { ValidationSummary } from "./types";

export function buildDetailedParsePrompt(
    validationSummary: ValidationSummary,
    aiLanguage: string = "zh-CN",
    currentDate: string
): string {
    // Build context section from validation summary
    const currencyHints = validationSummary.summary?.currencies
        .map(c => `- ${c.code}: ${c.hint}`)
        .join("\n") || "No currency hints";

    const categoryHints = validationSummary.summary?.categories
        .map(c => `- ${c.name}: ${c.hint}`)
        .join("\n") || "No category hints";

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

**Categories:**
${categoryHints}

${userRules}

### Context
- User's preferred language for output: ${aiLanguage}
- Current date reference: ${currentDate}

### Rules
1. Extract EACH individual item as a separate entry (unless user rules specify merging)
2. Use the pre-identified currencies - only use other currencies if clearly different
3. Assign categories from the pre-identified list
4. For dates:
   - If explicit date visible, use it (format: YYYY-MM-DD)
   - If relative (e.g., "yesterday"), calculate from current date
   - If no date visible, use current date
5. Amount must be positive numbers
6. Provide reasoning for any non-obvious parsing decisions

### Output Schema (raw JSON only, no markdown)
{
  "ledger_entries": [
    {
      "item_name": "Item description",
      "amount": 45.00,
      "currency": "CNY",
      "category": "餐饮",
      "entry_date": "2026-02-05",
      "notes": "Optional note or null"
    }
  ],
  "reasoning": "Explanation of parsing decisions"
}`;
}

/**
 * Stage 1 Prompt Builders
 *
 * All prompts are in English for better model instruction following.
 * User's preferred language (aiLanguage) is injected as output language.
 */

export function buildValidityCheckPrompt(aiLanguage: string = "zh-CN"): string {
  return `You are a financial document validation AI. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Determine if the input is a valid financial record that contains at least one identifiable monetary amount.

### Rules
1. Return is_valid: true if you can identify at least one monetary amount
2. Return is_valid: false if:
   - The image is blurry/unreadable
   - No amounts are visible
3. Provide reasoning in the user's preferred language: ${aiLanguage}

### Required output (JSON only, start your response with {)
{"is_valid": boolean, "reasoning": "..."}`;
}

export function buildCompletenessCheckPrompt(aiLanguage: string = "zh-CN"): string {
  return `You are a bookkeeping record completeness checker. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Determine if the input contains sufficient information for personal expense tracking. Accept various forms of records, not limited to formal transaction receipts.

### Acceptable Record Types (including but not limited to)
- Transaction receipts, invoices, bank statements
- Service pricing pages, subscription plan screenshots
- Menu prices, product price tags
- Any image or text containing clear amount information

### Judgment Logic (check in order)

**Step 1: Check for any identifiable amount**
If you can find any clear amount (total, monthly fee, unit price, pricing, etc.) → Judge as COMPLETE, end check.
Examples: ¥39/month, Total ¥100, Unit price 50 yuan, etc.

**Step 2: If no explicit amount, check for pricing information**
If pricing, rates, or plan prices are shown but no specific transaction amount → Judge as COMPLETE (use the pricing as the bookkeeping amount).
Examples: Monthly plan ¥39, Package price ¥199, etc.

### What is NOT a completeness issue (do NOT reject for these reasons)
- No merchant name, brand information
- No transaction date, time
- Not a formal invoice or receipt (e.g., pricing pages, menu screenshots)
- Only has pricing but no actual payment amount shown

### What IS a completeness issue (only reject for these)
- No visible amount or pricing information at all
- Amount/pricing information is obscured, blurry, or unreadable
- Image quality too poor to identify any numbers

### Core Principle
> As long as any amount information can be identified (transaction amount, pricing, monthly fee, etc.), judge as COMPLETE.

### Required output (JSON only, start your response with {)
If COMPLETE: {"is_complete": true}
If INCOMPLETE: {"is_complete": false, "issue": "Description in ${aiLanguage}"}`;
}

export function buildCurrencyRecognitionPrompt(
  aiLanguage: string = "zh-CN",
  preferredCurrencies: string[] = []
): string {
  const currencyHint =
    preferredCurrencies.length > 0
      ? `User's preferred currencies (as hints, not restrictions): ${preferredCurrencies.join(", ")}`
      : "No preferred currencies specified";

  return `You are a currency recognition AI. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Identify all currencies present in the financial document.

### Context
- ${currencyHint}
- User's preferred language for output: ${aiLanguage}

### Rules
1. Look for currency symbols (¥, $, €, £, RM, etc.) or codes (CNY, USD, EUR, MYR, etc.)
2. If no explicit symbol, infer from context (merchant name, language, location hints)
3. If genuinely unidentifiable, include "unknown" in the array
4. Explain your reasoning, especially for inferred currencies
5. For inferred currencies, clearly state what evidence led to the inference

### Required output (JSON only, start your response with {)
{"currencies": ["CNY"], "reasoning": "..."}`;
}

export function buildCategoryRecognitionPrompt(
  aiLanguage: string = "zh-CN",
  categories: { name: string; description: string | null }[]
): string {
  const categoryList = categories
    .map(
      (c) =>
        `- ${c.name}${c.description != null && c.description !== "" ? `: ${c.description}` : ""}`
    )
    .join("\n");

  return `You are a category recognition AI. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Identify which categories from the provided list are present in this financial document.

### Available Categories
${categoryList}

### Context
- User's preferred language for output: ${aiLanguage}

### Rules
1. Select ONLY from the provided categories
2. Only use "其他" (Other) as a LAST RESORT — only when the item truly does not fit ANY other available category. If there is any reasonable fit, prefer that category over "其他".
3. Multiple categories are allowed if the document contains items from different categories
4. Explain your reasoning

### Required output (JSON only, start your response with {)
{"categories": ["餐饮"], "reasoning": "..."}`;
}

export function buildTitleExtractionPrompt(aiLanguage: string = "zh-CN"): string {
  return `You are a title extraction AI. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Generate a concise, descriptive title for this financial document.

### Context
- User's preferred language for output: ${aiLanguage}

### Rules
1. Format: "[Merchant/Location] [Core Item(s)]" or just "[Core Description]"
2. Keep it short (under 20 characters if possible)
3. Use the user's preferred language
4. Focus on the main purpose of the expense

### Required output (JSON only, start your response with {)
{"title": "..."}`;
}

export function buildUserRequirementsPrompt(
  aiLanguage: string = "zh-CN",
  userPrompt: string
): string {
  return `You are a requirements interpreter AI. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.

### Task
Convert the user's custom requirements into specific processing rules for the financial document parser.

### User's Custom Requirements
${userPrompt}

### Context
- User's preferred language for output: ${aiLanguage}
- You are seeing the actual document the user wants to process
- Apply the user's requirements based on what you see in the document

### Rules
1. Generate actionable rules the parser should follow
2. Rules must not violate basic parsing logic (amounts must be positive, etc.)
3. Be specific about what to merge, split, or transform
4. If the user's requirements don't apply to this specific document, return an empty rules array

### Required output (JSON only, start your response with {)
{"rules": ["Rule 1", "Rule 2"]}`;
}

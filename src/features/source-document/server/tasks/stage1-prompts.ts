/**
 * Stage 1 Prompt Builders
 * 
 * All prompts are in English for better model instruction following.
 * User's preferred language (aiLanguage) is injected as output language.
 */

export function buildValidityCheckPrompt(aiLanguage: string = "zh-CN"): string {
    return `You are a financial document validation AI.

### Task
Determine if the input is a valid financial record that contains at least one identifiable monetary amount.

### Rules
1. Return is_valid: true if you can identify at least one monetary amount
2. Return is_valid: false if:
   - The image is blurry/unreadable
   - No amounts are visible
   - The content is not financial in nature
3. Provide reasoning in the user's preferred language: ${aiLanguage}

### Output (raw JSON only, no markdown)
{"is_valid": boolean, "reasoning": "..."}`;
}

export function buildCurrencyRecognitionPrompt(
    aiLanguage: string = "zh-CN",
    preferredCurrencies: string[] = []
): string {
    const currencyHint = preferredCurrencies.length > 0
        ? `User's preferred currencies (as hints, not restrictions): ${preferredCurrencies.join(", ")}`
        : "No preferred currencies specified";

    return `You are a currency recognition AI.

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

### Output (raw JSON only, no markdown)
{"currencies": ["CNY"], "reasoning": "..."}`;
}

export function buildCategoryRecognitionPrompt(
    aiLanguage: string = "zh-CN",
    categories: { name: string; description: string | null }[]
): string {
    const categoryList = categories
        .map(c => `- ${c.name}${c.description ? `: ${c.description}` : ""}`)
        .join("\n");

    return `You are a category recognition AI.

### Task
Identify which categories from the provided list are present in this financial document.

### Available Categories
${categoryList}

### Context
- User's preferred language for output: ${aiLanguage}

### Rules
1. Select ONLY from the provided categories
2. If items cannot be categorized, use "其他" (Other)
3. Multiple categories are allowed if the document contains items from different categories
4. Explain your reasoning

### Output (raw JSON only, no markdown)
{"categories": ["餐饮"], "reasoning": "..."}`;
}

export function buildTitleExtractionPrompt(aiLanguage: string = "zh-CN"): string {
    return `You are a title extraction AI.

### Task
Generate a concise, descriptive title for this financial document.

### Context
- User's preferred language for output: ${aiLanguage}

### Rules
1. Format: "[Merchant/Location] [Core Item(s)]" or just "[Core Description]"
2. Keep it short (under 20 characters if possible)
3. Use the user's preferred language
4. Focus on the main purpose of the expense

### Output (raw JSON only, no markdown)
{"title": "..."}`;
}

export function buildUserRequirementsPrompt(
    aiLanguage: string = "zh-CN",
    userPrompt: string
): string {
    return `You are a requirements interpreter AI.

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

### Output (raw JSON only, no markdown)
{"rules": ["Rule 1", "Rule 2"]}`;
}

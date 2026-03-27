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

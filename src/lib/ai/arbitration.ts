import { getOpenAIClient } from "./openai";
import { ParsedLedgerEntry } from "@/lib/message-processor/types";
import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * Arbitration result schema
 * - choice: 0 = bill is genuinely ambiguous, 1 = use first GPT, 2 = use second GPT
 * - reason: optional explanation when choice is 0
 */
const arbitrationResultSchema = z.object({
    choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    reason: z.string().optional(),
});

export type ArbitrationResult = z.infer<typeof arbitrationResultSchema>;

/**
 * Build the arbitration prompt for resolving dual GPT verification conflicts
 */
function buildArbitrationPrompt(
    scenario: "total_mismatch" | "unknown_currency",
    entries1: ParsedLedgerEntry[],
    entries2: ParsedLedgerEntry[],
    originalContent?: string,
    aiLanguage?: string
): string {
    const languageInstruction = aiLanguage === "en" || aiLanguage === "en-US"
        ? "Respond in English."
        : "请使用中文回复。";
    const formatEntries = (entries: ParsedLedgerEntry[]) =>
        entries.map(e => `- ${e.itemName}: ${e.currency} ${e.amount} (${e.category})`).join("\n");

    const total1 = entries1.reduce((sum, e) => sum + e.amount, 0);
    const total2 = entries2.reduce((sum, e) => sum + e.amount, 0);

    if (scenario === "total_mismatch") {
        return `You are a financial document arbitration AI. Two independent AI systems processed the same document and produced different results.

### Original Content
${originalContent || "(Image-based content)"}

### GPT Result #1 (Total: ${total1.toFixed(2)})
${formatEntries(entries1)}

### GPT Result #2 (Total: ${total2.toFixed(2)})
${formatEntries(entries2)}

### Task
Determine if the discrepancy is due to:
1. **Genuine ambiguity** in the original document (unclear amounts, missing info, conflicting data)
2. **AI parsing error** where one result is clearly more accurate

### Rules
- If the document itself is ambiguous or contains errors, return choice=0 with a reason
- If one GPT result is clearly correct, return choice=1 or choice=2
- Prefer the result that matches the document's stated total (if visible)
- When in doubt about which is correct, return choice=0

### Output (raw JSON only, no markdown)
{"choice": 0|1|2, "reason": "..."}

### Reason Field Requirements (IMPORTANT)
- Maximum 20 characters
- ${languageInstruction}
- State the specific issue directly (e.g., "金额模糊不清", "缺少总价信息", "数据相互矛盾")
- No generic phrases, be specific about what's wrong`;
    }

    // unknown_currency scenario
    const unknownEntries = entries1.filter(e => e.currency === "unknown");
    return `You are a financial document arbitration AI. An AI system could not determine the currency for some items.

### Original Content
${originalContent || "(Image-based content)"}

### Entries with Unknown Currency
${formatEntries(unknownEntries)}

### All Parsed Entries
${formatEntries(entries1)}

### Task
Determine if the currency truly cannot be identified:
1. **Genuinely unidentifiable** - no currency symbols, no clues from context, merchant location unknown
2. **Should be identifiable** - there are clues like symbols (¥, $, €), merchant name, or location hints

### Rules
- If the currency genuinely cannot be determined even with reasonable inference, return choice=0
- If you can confidently infer the currency, return choice=1 (the AI should have figured it out)
- Common patterns: Chinese merchants usually use CNY, US merchants use USD, etc.

### Output (raw JSON only, no markdown)
{"choice": 0|1, "reason": "..."}

### Reason Field Requirements (IMPORTANT)
- Maximum 20 characters
- ${languageInstruction}
- State the specific issue directly (e.g., "无货币符号", "商户地区未知", "多币种混合")
- No generic phrases, be specific about what's missing`;
}

/**
 * Execute arbitration between two GPT results
 */
export async function arbitrate(
    scenario: "total_mismatch" | "unknown_currency",
    entries1: ParsedLedgerEntry[],
    entries2: ParsedLedgerEntry[],
    originalContent?: string,
    aiLanguage?: string
): Promise<ArbitrationResult> {
    const client = getOpenAIClient();

    const systemPrompt = buildArbitrationPrompt(scenario, entries1, entries2, originalContent, aiLanguage);

    try {
        const { content } = await client.generateContent(systemPrompt, [
            { role: "user", content: "Please analyze and provide your arbitration decision." }
        ]);

        const cleaned = content.replace(/^```(?:json)?|```$/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const validated = arbitrationResultSchema.parse(parsed);

        logger.info({
            scenario,
            choice: validated.choice,
            reason: validated.reason
        }, "Arbitration completed");

        return validated;
    } catch (error) {
        logger.error({ error, scenario }, "Arbitration failed, defaulting to anomaly");
        // Default to marking as anomaly when arbitration fails
        return { choice: 0, reason: "Arbitration system error" };
    }
}

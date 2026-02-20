/**
 * Stage 2 Executor
 * 
 * Detailed parsing using dual GPT + arbitration.
 * Takes Stage 1.5 validation summary as context.
 */

import { z } from "zod";
import type { AIContext } from "@/lib/flow/types";
import type { ValidationSummary, ParsedEntry } from "./types";
import { buildDetailedParsePrompt } from "./stage2-prompts";

// ===== Zod Schema for Output =====

const entrySchema = z.object({
    item_name: z.string(),
    amount: z.number(),
    currency: z.string(),
    category_index: z.number().int().min(0),  // 0 = no category, 1+ = index
    entry_date: z.string().optional(),  // Optional: we use source document's entryDate instead
    notes: z.string().nullable(),
});

const parseOutputSchema = z.object({
    ledger_entries: z.array(entrySchema),
    reasoning: z.string(),
});

// ===== Helper: Build Message Content =====

function buildMessageContent(
    text?: string,
    imageUrls?: string[]
): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

    if (text) {
        content.push({ type: "text", text });
    }

    if (imageUrls?.length) {
        for (const url of imageUrls) {
            content.push({ type: "image_url", image_url: { url } });
        }
    }

    return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}

// ===== Helper: Parse JSON Response =====

function parseJsonResponse<T>(content: string, schema: z.ZodSchema<T>): T {
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return schema.parse(parsed);
}

// ===== Helper: Compare Entry Arrays =====

function compareEntries(entries1: ParsedEntry[], entries2: ParsedEntry[]): boolean {
    if (entries1.length !== entries2.length) return false;

    // Group by currency and category, compare totals
    const groupTotals = (entries: ParsedEntry[]) => {
        const groups: Record<string, number> = {};
        for (const e of entries) {
            const key = `${e.currency}:${e.category_index}`;
            groups[key] = (groups[key] || 0) + e.amount;
        }
        return groups;
    };

    const totals1 = groupTotals(entries1);
    const totals2 = groupTotals(entries2);

    const keys1 = Object.keys(totals1).sort();
    const keys2 = Object.keys(totals2).sort();

    if (keys1.join(",") !== keys2.join(",")) return false;

    // Allow small floating point differences
    for (const key of keys1) {
        if (Math.abs(totals1[key] - totals2[key]) > 0.01) return false;
    }

    return true;
}

// ===== Main Stage 2 Executor =====

export interface Stage2Input {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    validationSummary: ValidationSummary;
    originalCategories: { name: string; description: string | null }[];
}

export interface Stage2Output {
    entries: ParsedEntry[];
    title: string;
    reasoning: string;
    wasArbitrated: boolean;
}

export async function executeStage2(
    input: Stage2Input,
    ai: AIContext
): Promise<Stage2Output> {
    const messageContent = buildMessageContent(input.text, input.imageUrls);

    const prompt = buildDetailedParsePrompt(
        input.validationSummary,
        input.originalCategories,
        input.aiLanguage
    );

    // Use more capable model for detailed parsing
    const model = "gemini-3-flash-preview";

    // Dual GPT calls
    const [response1, response2] = await Promise.all([
        ai.generate({
            prompt,
            messages: [{ role: "user", content: messageContent }],
            responseFormat: "json_object",
            model,
        }),
        ai.generate({
            prompt,
            messages: [{ role: "user", content: messageContent }],
            responseFormat: "json_object",
            model,
        }),
    ]);

    const result1 = parseJsonResponse(response1.content, parseOutputSchema);
    const result2 = parseJsonResponse(response2.content, parseOutputSchema);

    // Compare results
    if (compareEntries(result1.ledger_entries, result2.ledger_entries)) {
        return {
            entries: result1.ledger_entries,
            title: input.validationSummary.summary?.title || "Untitled",
            reasoning: result1.reasoning,
            wasArbitrated: false,
        };
    }

    // Arbitration needed
    const arbitrationPrompt = `You are an arbitration AI for financial document parsing.

### Task Description
Determine which parsing result is more accurate for the given financial document.

### GPT 1 Result
${JSON.stringify(result1, null, 2)}

### GPT 2 Result
${JSON.stringify(result2, null, 2)}

### Your Task
Compare the two results and determine which is more accurate.
- Return choice: 1 to use GPT 1's result
- Return choice: 2 to use GPT 2's result
- Return choice: 0 if both have fundamental issues (mark as anomaly)

Look for:
- Correct amounts matching the document
- Proper categorization
- Reasonable date handling

### Output (raw JSON only)
{"choice": 1 | 2 | 0, "reason": "..."}`;

    const arbitrationResponse = await ai.generate({
        prompt: arbitrationPrompt,
        messages: [{ role: "user", content: messageContent }],
        responseFormat: "json_object",
        model: "gemini-3-pro-preview", // Use pro for arbitration
    });

    const arbitrationResult = parseJsonResponse(
        arbitrationResponse.content,
        z.object({
            choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
            reason: z.string().optional(),
        })
    );

    if (arbitrationResult.choice === 0) {
        throw new Error(`STAGE2_ARBITRATION_FAILED: ${arbitrationResult.reason || "Both parsing results invalid"}`);
    }

    const chosenResult = arbitrationResult.choice === 1 ? result1 : result2;

    return {
        entries: chosenResult.ledger_entries,
        title: input.validationSummary.summary?.title || "Untitled",
        reasoning: chosenResult.reasoning,
        wasArbitrated: true,
    };
}

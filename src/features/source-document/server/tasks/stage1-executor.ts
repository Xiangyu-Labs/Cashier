/**
 * Stage 1 Executor
 * 
 * Executes pre-analysis tasks in parallel:
 * - 1.1 Validity Check (dual GPT + arbitration)
 * - 1.2 Currency Recognition (dual GPT + arbitration)
 * - 1.3 Category Recognition (dual GPT + arbitration)
 * - 1.4 Title Extraction (single GPT)
 * - 1.5 User Requirements (single GPT, only if aiCustomPrompt exists)
 * 
 * Note: 1.1 runs first. If invalid, other tasks are skipped.
 */

import { z } from "zod";
import type { AIContext } from "@/lib/flow/types";
import type {
    ValidityCheckOutput,
    CurrencyRecognitionOutput,
    CategoryRecognitionOutput,
    TitleExtractionOutput,
    UserRequirementsOutput,
    Stage1Results,
} from "./types";
import {
    buildValidityCheckPrompt,
    buildCurrencyRecognitionPrompt,
    buildCategoryRecognitionPrompt,
    buildTitleExtractionPrompt,
    buildUserRequirementsPrompt,
} from "./stage1-prompts";

// ===== Zod Schemas for Response Validation =====

const validitySchema = z.object({
    is_valid: z.boolean(),
    reasoning: z.string(),
});

const currencySchema = z.object({
    currencies: z.array(z.string()),
    reasoning: z.string(),
});

const categorySchema = z.object({
    categories: z.array(z.string()),
    reasoning: z.string(),
});

const titleSchema = z.object({
    title: z.string(),
});

const rulesSchema = z.object({
    rules: z.array(z.string()),
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
    // Clean potential markdown code fences
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

// ===== Stage 1 Input Interface =====

export interface Stage1Input {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    preferredCurrencies?: string[];
    categories: { name: string; description: string | null }[];
    aiCustomPrompt?: string;
}

// ===== Dual GPT Runner with Arbitration =====

async function runDualGptWithArbitration<T>(
    taskName: string,
    prompt: string,
    messageContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
    schema: z.ZodSchema<T>,
    ai: AIContext,
    model: string = "gemini-3-flash",
    compareResults: (r1: T, r2: T) => boolean
): Promise<{ result: T; reasoning: string; wasArbitrated: boolean }> {
    // Run dual GPT calls in parallel
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

    const result1 = parseJsonResponse(response1.content, schema);
    const result2 = parseJsonResponse(response2.content, schema);

    // If results match, return GPT1's result
    if (compareResults(result1, result2)) {
        return {
            result: result1,
            reasoning: (result1 as { reasoning?: string }).reasoning || "",
            wasArbitrated: false,
        };
    }

    // Results don't match - run arbitration
    const arbitrationPrompt = `You are an arbitration AI.

### Task Description
${taskName}

### GPT 1 Result
${JSON.stringify(result1, null, 2)}

### GPT 2 Result
${JSON.stringify(result2, null, 2)}

### Your Task
Determine which result is more accurate based on the original input.
- Return choice: 1 to use GPT 1's result
- Return choice: 2 to use GPT 2's result
- Return choice: 0 if both are incorrect (mark as anomaly)

### Output (raw JSON only)
{"choice": 1 | 2 | 0, "reason": "..."}`;

    const arbitrationResponse = await ai.generate({
        prompt: arbitrationPrompt,
        messages: [{ role: "user", content: messageContent }],
        responseFormat: "json_object",
        model,
    });

    const arbitrationResult = parseJsonResponse(
        arbitrationResponse.content,
        z.object({
            choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
            reason: z.string().optional(),
        })
    );

    if (arbitrationResult.choice === 0) {
        throw new Error(`ARBITRATION_FAILED: ${taskName} - ${arbitrationResult.reason || "Both results invalid"}`);
    }

    const chosenResult = arbitrationResult.choice === 1 ? result1 : result2;
    return {
        result: chosenResult,
        reasoning: (chosenResult as { reasoning?: string }).reasoning || "",
        wasArbitrated: true,
    };
}

// ===== Main Stage 1 Executor =====

export async function executeStage1(
    input: Stage1Input,
    ai: AIContext,
    signal?: AbortSignal
): Promise<{ isValid: false } | { isValid: true; results: Stage1Results }> {
    const messageContent = buildMessageContent(input.text, input.imageUrls);
    const model = "gemini-2.0-flash";

    // Step 1: Check validity first
    const validityPrompt = buildValidityCheckPrompt(input.aiLanguage);
    const validityResult = await runDualGptWithArbitration<ValidityCheckOutput>(
        "Validity Check - Determine if input contains valid financial data",
        validityPrompt,
        messageContent,
        validitySchema,
        ai,
        model,
        (r1, r2) => r1.is_valid === r2.is_valid
    );

    // If not valid, return early
    if (!validityResult.result.is_valid) {
        return { isValid: false };
    }

    // Check for cancellation
    if (signal?.aborted) {
        throw new Error("Task cancelled");
    }

    // Step 2: Run remaining tasks in parallel
    const [currencyResult, categoryResult, titleResult, userReqResult] = await Promise.all([
        // 1.2 Currency Recognition (dual GPT)
        runDualGptWithArbitration<CurrencyRecognitionOutput>(
            "Currency Recognition - Identify currencies in the document",
            buildCurrencyRecognitionPrompt(input.aiLanguage, input.preferredCurrencies),
            messageContent,
            currencySchema,
            ai,
            model,
            (r1, r2) => JSON.stringify(r1.currencies.sort()) === JSON.stringify(r2.currencies.sort())
        ),

        // 1.3 Category Recognition (dual GPT)
        runDualGptWithArbitration<CategoryRecognitionOutput>(
            "Category Recognition - Identify expense categories",
            buildCategoryRecognitionPrompt(input.aiLanguage, input.categories),
            messageContent,
            categorySchema,
            ai,
            model,
            (r1, r2) => JSON.stringify(r1.categories.sort()) === JSON.stringify(r2.categories.sort())
        ),

        // 1.4 Title Extraction (single GPT)
        (async (): Promise<TitleExtractionOutput> => {
            const response = await ai.generate({
                prompt: buildTitleExtractionPrompt(input.aiLanguage),
                messages: [{ role: "user", content: messageContent }],
                responseFormat: "json_object",
                model,
            });
            return parseJsonResponse(response.content, titleSchema);
        })(),

        // 1.5 User Requirements (conditional, single GPT)
        (async (): Promise<UserRequirementsOutput | undefined> => {
            if (!input.aiCustomPrompt?.trim()) {
                return undefined;
            }
            const response = await ai.generate({
                prompt: buildUserRequirementsPrompt(input.aiLanguage, input.aiCustomPrompt),
                messages: [{ role: "user", content: messageContent }],
                responseFormat: "json_object",
                model,
            });
            return parseJsonResponse(response.content, rulesSchema);
        })(),
    ]);

    return {
        isValid: true,
        results: {
            validity: validityResult.result,
            currency: currencyResult.result,
            category: categoryResult.result,
            title: titleResult,
            userRequirements: userReqResult,
        },
    };
}

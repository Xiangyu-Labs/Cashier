/**
 * Stage 1 Executor
 *
 * Executes pre-analysis tasks in parallel:
 * - 1.1 Validity Check (dual GPT + arbitration)
 * - 1.2 Completeness Check (single GPT) - detect obvious missing content
 * - 1.3 Currency Recognition (dual GPT + arbitration)
 * - 1.4 Category Recognition (dual GPT + arbitration)
 * - 1.5 Title Extraction (single GPT)
 * - 1.6 User Requirements (single GPT, only if aiCustomPrompt exists)
 *
 * Note: 1.1 runs first. If invalid, other tasks are skipped.
 * Note: 1.2 runs with 1.1. If incomplete, other tasks are skipped.
 */

import { parseJsonResponse } from "@/lib/ai/response-parser";
import { runDualGptWithArbitration } from "@/lib/ai/dual-gpt-runner";
import type { AIContext, AIModelTier } from "@/lib/flow/types";
import type {
    ValidityCheckOutput,
    CompletenessCheckOutput,
    CurrencyRecognitionOutput,
    CategoryRecognitionOutput,
    TitleExtractionOutput,
    UserRequirementsOutput,
    Stage1Results,
} from "./types";
import {
    validitySchema,
    completenessSchema,
    currencySchema,
    categorySchema,
    titleSchema,
    rulesSchema,
} from "./schemas";
import {
    buildValidityCheckPrompt,
    buildCompletenessCheckPrompt,
    buildCurrencyRecognitionPrompt,
    buildCategoryRecognitionPrompt,
    buildTitleExtractionPrompt,
    buildUserRequirementsPrompt,
} from "./stage1-prompts";
import { buildMessageContent, type MessageContentPart } from "./message-content";

export interface Stage1Input {
    text?: string;
    imageUrls?: string[];
    visionDescription?: string;
    aiLanguage?: string;
    preferredCurrencies?: string[];
    categories: { name: string; description: string | null }[];
    aiCustomPrompt?: string;
}

// Individual task runners

/**
 * Run validity check using dual GPT with arbitration
 */
async function runValidityTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    ai: AIContext
): Promise<ValidityCheckOutput> {
    const result = await runDualGptWithArbitration<ValidityCheckOutput>({
        taskName: "Validity Check - Determine if input contains valid financial data",
        prompt: buildValidityCheckPrompt(aiLanguage),
        messageContent,
        schema: validitySchema,
        ai,
        model: 'text',
        compareResults: (r1, r2) => r1.is_valid === r2.is_valid,
    });
    return result.result;
}

/**
 * Run completeness check using single GPT
 */
async function runCompletenessTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    ai: AIContext
): Promise<CompletenessCheckOutput> {
    const response = await ai.generate({
        prompt: buildCompletenessCheckPrompt(aiLanguage),
        messages: [{ role: "user", content: messageContent }],
        requireJson: true,
        model: 'text',
    });
    return parseJsonResponse(response.content, completenessSchema);
}

/**
 * Run currency recognition using dual GPT with arbitration
 */
async function runCurrencyTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    preferredCurrencies: string[] | undefined,
    ai: AIContext
): Promise<CurrencyRecognitionOutput> {
    const result = await runDualGptWithArbitration<CurrencyRecognitionOutput>({
        taskName: "Currency Recognition - Identify currencies in the document",
        prompt: buildCurrencyRecognitionPrompt(aiLanguage, preferredCurrencies),
        messageContent,
        schema: currencySchema,
        ai,
        model: 'text',
        compareResults: (r1, r2) => JSON.stringify(r1.currencies.sort()) === JSON.stringify(r2.currencies.sort()),
    });
    return result.result;
}

/**
 * Run category recognition using dual GPT with arbitration
 */
async function runCategoryTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    categories: { name: string; description: string | null }[],
    ai: AIContext
): Promise<CategoryRecognitionOutput> {
    const result = await runDualGptWithArbitration<CategoryRecognitionOutput>({
        taskName: "Category Recognition - Identify expense categories",
        prompt: buildCategoryRecognitionPrompt(aiLanguage, categories),
        messageContent,
        schema: categorySchema,
        ai,
        model: 'text',
        compareResults: (r1, r2) => JSON.stringify(r1.categories.sort()) === JSON.stringify(r2.categories.sort()),
    });
    return result.result;
}

/**
 * Run title extraction using single GPT
 */
async function runTitleTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    ai: AIContext
): Promise<TitleExtractionOutput> {
    const response = await ai.generate({
        prompt: buildTitleExtractionPrompt(aiLanguage),
        messages: [{ role: "user", content: messageContent }],
        requireJson: true,
        model: 'text',
    });
    return parseJsonResponse(response.content, titleSchema);
}

/**
 * Run user requirements extraction (conditional)
 */
async function runUserRequirementsTask(
    messageContent: MessageContentPart[],
    aiLanguage: string | undefined,
    aiCustomPrompt: string | undefined,
    ai: AIContext
): Promise<UserRequirementsOutput | undefined> {
    if (!aiCustomPrompt?.trim()) {
        return undefined;
    }
    const response = await ai.generate({
        prompt: buildUserRequirementsPrompt(aiLanguage, aiCustomPrompt),
        messages: [{ role: "user", content: messageContent }],
        requireJson: true,
        model: 'text',
    });
    return parseJsonResponse(response.content, rulesSchema);
}

/**
 * Compile all stage 1 results into final output
 */
function compileStage1Results(
    validity: ValidityCheckOutput,
    completeness: CompletenessCheckOutput,
    currency: CurrencyRecognitionOutput,
    category: CategoryRecognitionOutput,
    title: TitleExtractionOutput,
    userRequirements: UserRequirementsOutput | undefined
): { isValid: true; isIncomplete: true; incompleteReason?: string } | { isValid: true; isIncomplete: false; results: Stage1Results } {
    if (!completeness.is_complete) {
        return {
            isValid: true,
            isIncomplete: true,
            incompleteReason: completeness.issue,
        };
    }

    return {
        isValid: true,
        isIncomplete: false,
        results: {
            validity,
            currency,
            category,
            title,
            userRequirements,
        },
    };
}

export async function executeStage1(
    input: Stage1Input,
    ai: AIContext,
    signal?: AbortSignal
): Promise<
    | { isValid: false }
    | { isValid: true; isIncomplete: true; incompleteReason?: string }
    | { isValid: true; isIncomplete: false; results: Stage1Results }
> {
    const messageContent = buildMessageContent(input.text, input.imageUrls, input.visionDescription);

    // Step 1: Check validity first
    const validityResult = await runValidityTask(messageContent, input.aiLanguage, ai);

    // If not valid, return early
    if (!validityResult.is_valid) {
        return { isValid: false };
    }

    // Check for cancellation
    if (signal?.aborted) {
        throw new Error("Task cancelled");
    }

    // Step 2: Run completeness check and other tasks in parallel
    const [completenessResult, currencyResult, categoryResult, titleResult, userReqResult] = await Promise.all([
        runCompletenessTask(messageContent, input.aiLanguage, ai),
        runCurrencyTask(messageContent, input.aiLanguage, input.preferredCurrencies, ai),
        runCategoryTask(messageContent, input.aiLanguage, input.categories, ai),
        runTitleTask(messageContent, input.aiLanguage, ai),
        runUserRequirementsTask(messageContent, input.aiLanguage, input.aiCustomPrompt, ai),
    ]);

    return compileStage1Results(
        validityResult,
        completenessResult,
        currencyResult,
        categoryResult,
        titleResult,
        userReqResult
    );
}

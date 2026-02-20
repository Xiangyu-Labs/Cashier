/**
 * Stage 1.5 Validator
 * 
 * Single GPT that reviews Stage 1 results and has two responsibilities:
 * 1. Veto power - reject if results are unreasonable
 * 2. Consolidation - merge results and add guidance hints for Stage 2
 */

import { z } from "zod";
import type { AIContext } from "@/lib/flow/types";
import type { Stage1Results, ValidationSummary } from "./types";

// ===== Zod Schema for Validation Output =====

const validationOutputSchema = z.object({
    is_reasonable: z.boolean(),
    summary: z.object({
        title: z.string(),
        currencies: z.array(z.object({
            code: z.string(),
            hint: z.string(),
        })),
        categories: z.array(z.object({
            name: z.string(),
            hint: z.string(),
        })),
        rules: z.array(z.string()).optional(),
    }).optional(),
    rejection_reason: z.string().optional(),
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

// ===== Build Validation Prompt =====

function buildValidationPrompt(
    stage1Results: Stage1Results,
    aiLanguage: string = "zh-CN"
): string {
    const resultsJson = JSON.stringify({
        validity: stage1Results.validity,
        currency: stage1Results.currency,
        category: stage1Results.category,
        title: stage1Results.title,
        userRequirements: stage1Results.userRequirements,
    }, null, 2);

    return `You are a validation AI that reviews pre-analysis results.

### Task
Review the Stage 1 pre-analysis results and determine if they are reasonable and consistent.

### Stage 1 Results
${resultsJson}

### Context
- User's preferred language for output: ${aiLanguage}

### Your Responsibilities

1. **Veto Power**: If the results are clearly wrong or inconsistent, set is_reasonable: false
   - Examples: currency doesn't match obvious symbols, category contradicts content
   
2. **Consolidate & Add Hints**: If reasonable, create a summary with guidance hints
   - For each currency: explain WHY it was identified (symbol, inference, etc.)
   - For each category: explain WHAT content led to this category
   - These hints help Stage 2 parser understand context

### Output (raw JSON only, no markdown)

If UNREASONABLE:
{
  "is_reasonable": false,
  "rejection_reason": "Explain why the results are wrong"
}

If REASONABLE:
{
  "is_reasonable": true,
  "summary": {
    "title": "Refined title",
    "currencies": [
      {"code": "CNY", "hint": "Identified by ¥ symbol in amount"}
    ],
    "categories": [
      {"name": "餐饮", "hint": "Contains food items like noodles and drinks"}
    ],
    "rules": ["Optional user requirement rules if any"]
  }
}`;
}

// ===== Main Validator Function =====

export interface ValidationInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    stage1Results: Stage1Results;
}

export async function executeStage1_5Validation(
    input: ValidationInput,
    ai: AIContext
): Promise<ValidationSummary> {
    const messageContent = buildMessageContent(input.text, input.imageUrls);
    const prompt = buildValidationPrompt(input.stage1Results, input.aiLanguage);

    const response = await ai.generate({
        prompt,
        messages: [{ role: "user", content: messageContent }],
        responseFormat: "json_object",
        model: "gemini-3-pro-preview",
    });

    const result = parseJsonResponse(response.content, validationOutputSchema);

    return {
        is_reasonable: result.is_reasonable,
        summary: result.summary,
        rejection_reason: result.rejection_reason,
    };
}

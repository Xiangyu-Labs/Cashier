/**
 * Categorize Entry Task
 *
 * AI-powered task to categorize a single ledger entry.
 * Uses index-based category matching for disambiguation.
 */

import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { forLedger } from "@/lib/db/scoped-query";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const TASK_TYPE_CATEGORIZE_ENTRY = "categorize_entry";

export interface CategorizeEntryInput {
    ledgerId: string;
    entryId: string;
    // Entry details for AI context
    itemName: string;
    amount: string;
    currency: string;
    description: string | null;
    entryDate: string;
    // Optional source document context
    sourceDocumentText?: string;
    sourceDocumentImageUrls?: string[];
    // Categories with index for matching
    categories: Array<{
        id: string;      // For onComplete lookup
        index: number;   // 1-based, for AI
        name: string;
        description: string | null;
    }>;
    aiLanguage?: string;
}

export interface CategorizeEntryOutput {
    categoryIndex: number;  // 0 = no match, 1+ = matched category index
    confidence: number;
    reasoning: string;
}

const outputSchema = z.object({
    category_index: z.number().int().min(0),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
});

function buildCategorizationPrompt(input: CategorizeEntryInput): string {
    const categoriesJson = JSON.stringify(input.categories.map(c => ({
        index: c.index,
        name: c.name,
        description: c.description
    })), null, 2);

    return `You are a financial categorization AI.

### Task
Categorize the following ledger entry into one of the available categories.

### Entry Details
- Item Name: ${input.itemName}
- Amount: ${input.amount} ${input.currency}
- Description: ${input.description || 'N/A'}
- Date: ${input.entryDate}

### Available Categories (use category_index in output)
${categoriesJson}

### Rules
1. Analyze the item name and description to determine the best category
2. If you have additional context from source document, use it
3. Return category_index = 0 if no category fits well
4. Provide confidence score (0-1) and reasoning

### Output (raw JSON only)
{
  "category_index": 1,
  "confidence": 0.95,
  "reasoning": "Item name suggests food expense"
}`;
}

export const categorizeEntryHandler: FlowTaskHandler<CategorizeEntryInput, CategorizeEntryOutput> = {
    async execute(input: CategorizeEntryInput, context: FlowContext): Promise<CategorizeEntryOutput> {
        const { signal, ai } = context;

        if (!input.ledgerId) throw new Error("Missing ledgerId");
        if (!input.entryId) throw new Error("Missing entryId");

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const prompt = buildCategorizationPrompt(input);

        // Build message content - include source document if available
        const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

        if (input.sourceDocumentText) {
            content.push({ type: "text", text: `Source Document:\n${input.sourceDocumentText}` });
        }

        if (input.sourceDocumentImageUrls?.length) {
            for (const url of input.sourceDocumentImageUrls) {
                content.push({ type: "image_url", image_url: { url } });
            }
        }

        if (content.length === 0) {
            content.push({ type: "text", text: "No additional context available." });
        }

        const response = await ai.generate({
            prompt,
            messages: [{ role: "user", content }],
            responseFormat: "json_object",
            model: 'fast',
        });

        // Parse response
        let cleaned = response.content.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();

        const parsed = JSON.parse(cleaned);
        const validated = outputSchema.parse(parsed);

        return {
            categoryIndex: validated.category_index,
            confidence: validated.confidence,
            reasoning: validated.reasoning,
        };
    },

    async onComplete(output: CategorizeEntryOutput, input: CategorizeEntryInput, context: FlowContext): Promise<void> {
        if (!input.ledgerId || !input.entryId) return;

        // Only update if we have a valid category match
        if (output.categoryIndex > 0 && output.categoryIndex <= input.categories.length) {
            const category = input.categories.find(c => c.index === output.categoryIndex);

            if (category?.id) {
                const q = forLedger(ledgerEntries, input.ledgerId);

                await db.update(ledgerEntries)
                    .set({
                        categoryId: category.id,
                        updatedAt: new Date(),
                    })
                    .where(q.whereId(input.entryId));

                logger.info({
                    entryId: input.entryId,
                    categoryIndex: output.categoryIndex,
                    categoryId: category.id,
                    confidence: output.confidence,
                }, "Auto-categorized entry");
            }
        } else {
            logger.info({
                entryId: input.entryId,
                categoryIndex: output.categoryIndex,
            }, "No category match found for entry");
        }
    },

    async onError(error: Error, input: CategorizeEntryInput, context: FlowContext): Promise<void> {
        logger.error({
            err: error,
            entryId: input.entryId,
        }, "Categorize entry task failed");
        // Keep categoryId as null - no action needed
    },
};

// Register the task
flowEngine.register(TASK_TYPE_CATEGORIZE_ENTRY, categorizeEntryHandler);

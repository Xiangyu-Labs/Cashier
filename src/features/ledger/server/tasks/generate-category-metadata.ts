import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { forLedger } from "@/lib/db/scoped-query";
import { buildCategoryMetadataPrompt, COMMON_LUCIDE_ICONS } from "@/features/ai/server/services/category-prompts";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const TASK_TYPE_GENERATE_CATEGORY_METADATA = "generate_category_metadata";

export interface GenerateCategoryMetadataInput {
    categoryId: string;
    categoryName: string;
    existingCategories: Array<{
        name: string;
        description?: string | null;
        icon?: string | null;
    }>;
    aiLanguage?: string;
}

export interface GenerateCategoryMetadataOutput {
    icon: string;
    description: string;
    success: boolean;
}

const aiResponseSchema = z.object({
    icon: z.string(),
    description: z.string(),
});

export const generateCategoryMetadataHandler: FlowTaskHandler<GenerateCategoryMetadataInput, GenerateCategoryMetadataOutput> = {
    // 1. Main execution (validation moved inline)
    async execute(input: GenerateCategoryMetadataInput, context: FlowContext): Promise<GenerateCategoryMetadataOutput> {
        if (!context.ledgerId) throw new Error("Missing ledgerId in task context");
        if (!input.categoryId) throw new Error("Missing categoryId");
        if (!input.categoryName) throw new Error("Missing categoryName");

        const prompt = buildCategoryMetadataPrompt(
            input.categoryName,
            input.existingCategories,
            input.aiLanguage
        );

        try {
            // Use context.ai instead of direct OpenAI client
            // Use a cheaper model since this is text-only
            const { content } = await context.ai.generate({
                prompt,
                messages: [{ role: 'user', content: 'Generate the category metadata as specified.' }],
                model: 'gpt-4o-mini', // Cheaper model for text-only task
                responseFormat: 'json_object',
            });

            // Basic JSON extraction
            const jsonStart = content.indexOf('{');
            const jsonEnd = content.lastIndexOf('}');
            let jsonStr = content;
            if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonStr = content.substring(jsonStart, jsonEnd + 1);
            }

            const parsed = JSON.parse(jsonStr);
            const validated = aiResponseSchema.parse(parsed);

            // Validate icon existence
            let icon = validated.icon;
            if (!COMMON_LUCIDE_ICONS.includes(icon)) {
                // Fallback if AI hallucinates an icon not in our list
                // Double check if it's a valid string, otherwise use default
                icon = "Package";
            }

            return {
                icon,
                description: validated.description,
                success: true
            };

        } catch (error) {
            logger.error({ err: error, categoryName: input.categoryName }, "Failed to generate category metadata");
            // Return failure but don't throw, to allow graceful degradation (empty icon/desc)
            return {
                icon: "Package",
                description: "",
                success: false
            };
        }
    },

    // 2. Completion
    async onComplete(output: GenerateCategoryMetadataOutput, input: GenerateCategoryMetadataInput, context: FlowContext): Promise<void> {
        if (!output.success) return;
        if (!context.ledgerId) return;

        const q = forLedger(entryCategories, context.ledgerId);

        await db.update(entryCategories)
            .set({
                icon: output.icon,
                description: output.description,
                updatedAt: new Date(),
            })
            .where(q.whereId(input.categoryId));

        // Note: No push notification needed here as valid-invalidation/smart-polling handles the UI update
        // But if we want to be fancy we could send one. For now, keep it simple.
        logger.info({ categoryId: input.categoryId, icon: output.icon }, "Updated category metadata from AI");
    },

    // 3. Error handling
    async onError(error: Error, input: GenerateCategoryMetadataInput, _context: FlowContext): Promise<void> {
        logger.error({ err: error, categoryId: input.categoryId }, "Generate category metadata task failed");
        // No side effects needed, category stays as is (empty metadata)
    }
};

// Register the task
flowEngine.register(TASK_TYPE_GENERATE_CATEGORY_METADATA, generateCategoryMetadataHandler);

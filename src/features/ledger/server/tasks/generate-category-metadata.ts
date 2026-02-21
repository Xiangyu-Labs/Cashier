import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { forLedger } from "@/lib/db/scoped-query";
import { buildCategoryMetadataPrompt } from "./category-metadata-prompts";
import { COMMON_LUCIDE_ICONS } from "@/config/icons";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const TASK_TYPE_GENERATE_CATEGORY_METADATA = "generate_category_metadata";

export interface GenerateCategoryMetadataInput {
    ledgerId: string;
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
        if (!input.ledgerId) throw new Error("Missing ledgerId in task input");
        if (!input.categoryId) throw new Error("Missing categoryId");
        if (!input.categoryName) throw new Error("Missing categoryName");

        const prompt = buildCategoryMetadataPrompt(
            input.categoryName,
            input.existingCategories,
            input.aiLanguage
        );

        // Use context.ai with fast tier for category metadata generation
        const { content } = await context.ai.generate({
            prompt,
            messages: [{ role: 'user', content: 'Generate the category metadata as specified.' }],
            responseFormat: 'json_object',
            model: 'fast',
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
            icon = "Package";
        }

        return {
            icon,
            description: validated.description,
            success: true
        };
    },

    // 2. Completion
    async onComplete(output: GenerateCategoryMetadataOutput, input: GenerateCategoryMetadataInput, context: FlowContext): Promise<void> {
        if (!output.success) return;
        if (!input.ledgerId) return;

        const q = forLedger(entryCategories, input.ledgerId);

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

    // 3. Error handling - set default values to stop "generating" state in UI
    async onError(error: Error, input: GenerateCategoryMetadataInput, context: FlowContext): Promise<void> {
        logger.error({ err: error, categoryId: input.categoryId }, "Generate category metadata task failed");

        // Set default values to prevent UI from showing "generating" forever
        if (input.ledgerId && input.categoryId) {
            const q = forLedger(entryCategories, input.ledgerId);
            await db.update(entryCategories)
                .set({
                    icon: "Package", // Default icon
                    description: "", // Empty description
                    updatedAt: new Date(),
                })
                .where(q.whereId(input.categoryId));

            logger.info({ categoryId: input.categoryId }, "Set default metadata after task failure");
        }
    }
};

// Register the task
flowEngine.register(TASK_TYPE_GENERATE_CATEGORY_METADATA, generateCategoryMetadataHandler);

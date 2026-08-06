import { z } from "zod";
import { COMMON_LUCIDE_ICONS } from "@/config/icons";
import { buildAiOutputLocaleInstruction } from "@/config/ai-output-locales";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { runtimeEnv } from "@/lib/env/runtime";
import { extractJson } from "@/lib/tasks/json-utils";
import type { CategoryMetadataGeneratorPort } from "@/modules/ledger/application/ports";

const metadataSchema = z.object({
  icon: z.enum(COMMON_LUCIDE_ICONS as [string, ...string[]]),
  description: z.string().trim().min(1).max(120),
});

export const categoryMetadataGeneratorAdapter: CategoryMetadataGeneratorPort = {
  async generate(input) {
    const prompt = `Generate bookkeeping category metadata. Return JSON only. The icon must be selected from the provided Lucide icon names. Keep the description short and concrete.
${input.customPrompt == null || input.customPrompt === "" ? "" : `\n### Additional Instructions\n${input.customPrompt}\n`}
${buildAiOutputLocaleInstruction(input.language)}
Only the category description is user-visible in this response; apply the mandatory output locale to it.`;
    const result = await getOpenAIClient().generateContent(
      prompt,
      [
        {
          role: "user",
          content: JSON.stringify({
            category: input.categoryName,
            existingCategories: input.existingCategoryNames,
            language: input.language,
            allowedIcons: COMMON_LUCIDE_ICONS,
            output: { icon: "Lucide icon name", description: "maximum 120 characters" },
          }),
        },
      ],
      runtimeEnv.aiModel,
      180,
      0.2
    );
    return metadataSchema.parse(JSON.parse(extractJson(result.content)));
  },
};

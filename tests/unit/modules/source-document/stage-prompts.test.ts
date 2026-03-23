import { describe, expect, it } from "vitest";

import { buildCategoryRecognitionPrompt } from "@/modules/source-document/application/parse-source-document/stage1-prompts";
import { buildDetailedParsePrompt } from "@/modules/source-document/application/parse-source-document/stage2-prompts";
import type { ValidationSummary } from "@/modules/source-document/application/parse-source-document/types";

describe("buildCategoryRecognitionPrompt", () => {
  it("should instruct AI to use Other only as last resort", () => {
    const prompt = buildCategoryRecognitionPrompt("zh-CN", [
      { name: "餐饮", description: null },
      { name: "其他", description: null },
    ]);

    expect(prompt).toMatch(/last.?resort|最后手段|万不得已|only if.*no.*categor/i);
  });
});

describe("buildDetailedParsePrompt", () => {
  it("should instruct AI to assign 'Other' category index only as last resort", () => {
    const summary: ValidationSummary = {
      is_reasonable: true,
      summary: {
        title: "Test",
        currencies: [],
        categories: [],
        rules: [],
      },
    };
    const categories = [
      { name: "餐饮", description: null },
      { name: "其他", description: null },
    ];

    const prompt = buildDetailedParsePrompt(summary, categories);

    expect(prompt).toMatch(/last.?resort|最后手段|万不得已|only if.*no.*categor/i);
  });
});

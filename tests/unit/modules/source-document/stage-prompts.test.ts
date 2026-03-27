import { describe, it, expect } from "vitest";

import { buildDetailedParsePrompt } from "@/modules/source-document/application/parse-source-document/stage2-prompts";

describe("buildDetailedParsePrompt", () => {
  it("should instruct AI to assign 'Other' category index only as last resort", () => {
    const categories = [
      { name: "餐饮", description: null },
      { name: "其他", description: null },
    ];

    const prompt = buildDetailedParsePrompt({ categories });

    expect(prompt).toMatch(/last.?resort|最后手段|万不得已|only if.*no.*categor/i);
  });

  it("should include category names in prompt", () => {
    const categories = [
      { name: "餐饮", description: "日常餐饮" },
      { name: "交通", description: null },
    ];

    const prompt = buildDetailedParsePrompt({ categories });

    expect(prompt).toContain("餐饮");
    expect(prompt).toContain("交通");
  });

  it("should include user custom prompt when provided", () => {
    const categories = [{ name: "餐饮", description: null }];
    const prompt = buildDetailedParsePrompt({
      categories,
      aiCustomPrompt: "合并相同类别的条目",
    });

    expect(prompt).toContain("合并相同类别的条目");
  });
});

import { describe, it, expect } from "vitest";
import { buildTransactionPrompt } from "@/lib/ai/prompts";
import { CategoryInfo } from "@/lib/message-processor/types";

describe("buildTransactionPrompt", () => {
  const sampleCategories: CategoryInfo[] = [
    { id: "1", name: "餐饮", description: "外卖、堂食" },
    { id: "2", name: "交通", description: "公交、地铁" },
  ];

  it("should list all categories with descriptions", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("1. 餐饮 - 外卖、堂食");
    expect(prompt).toContain("2. 交通 - 公交、地铁");
  });

  it("should handle categories without description", () => {
    const categories: CategoryInfo[] = [
      { id: "1", name: "其他", description: null },
    ];
    const prompt = buildTransactionPrompt(categories);
    expect(prompt).toContain("1. 其他");
    expect(prompt).not.toContain("1. 其他 -");
  });

  it("should list all categories with descriptions", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("1. 餐饮 - 外卖、堂食");
    expect(prompt).toContain("2. 交通 - 公交、地铁");
  });

  it("should include JSON format example", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain('"transactions"');
    expect(prompt).toContain('"item_name"');
    expect(prompt).toContain('"amount"');
    expect(prompt).toContain('"currency"');
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('"transaction_date"');
  });

  it("should include rules about currency detection", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("CNY");
    expect(prompt).toContain("USD");
    expect(prompt).toContain("EUR");
  });

  it("should mention positive amount requirement", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("正数");
  });

  it("should handle empty categories array", () => {
    const prompt = buildTransactionPrompt([]);
    expect(prompt).toBeDefined();
  });
});

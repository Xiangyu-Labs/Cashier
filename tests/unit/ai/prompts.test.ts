import { describe, it, expect } from "vitest";
import { buildTransactionPrompt } from "@/lib/ai/prompts";
import { CategoryInfo } from "@/lib/message-processor/types";

describe("buildTransactionPrompt", () => {
  const sampleCategories: CategoryInfo[] = [
    { id: "1", name: "餐饮", description: "外卖、堂食" },
    { id: "2", name: "交通", description: "公交、地铁" },
  ];

  it("should include the provided current date", () => {
    const customDate = "2025-05-20";
    const prompt = buildTransactionPrompt(sampleCategories, customDate);

    expect(prompt).toContain(`**当前日期**: ${customDate}`);
    expect(prompt).toContain(customDate);
  });

  it("should use today's date if not provided", () => {
    const today = new Date().toISOString().split('T')[0];
    const prompt = buildTransactionPrompt(sampleCategories);

    expect(prompt).toContain(today);
  });

  it("should list all categories", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("1. 餐饮 - 外卖、堂食");
    expect(prompt).toContain("2. 交通 - 公交、地铁");
  });

  it("should include few-shot examples", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("Few-Shot Examples");
    expect(prompt).toContain("在711买了2瓶可乐");
    expect(prompt).toContain("Yesterday taxi to airport");
  });

  it("should include JSON format requirements", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("STRICT JSON");
    expect(prompt).toContain("transactions");
    expect(prompt).toContain("item_name");
  });

  it("should include specific rules", () => {
    const prompt = buildTransactionPrompt(sampleCategories);
    expect(prompt).toContain("拆分原则");
    expect(prompt).toContain("货币识别");
    expect(prompt).toContain("相对日期");
  });
});

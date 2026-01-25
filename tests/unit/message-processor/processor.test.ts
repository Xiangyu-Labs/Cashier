import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput, ProcessorContext } from "@/lib/message-processor/types";
import { MOCK_RESPONSES } from "../../helpers/mocks/gemini";

// Mock the Gemini client
vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

import { getGeminiClient } from "@/lib/ai/gemini";

describe("GeminiMessageProcessor", () => {
  let processor: GeminiMessageProcessor;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const defaultContext: ProcessorContext = {
    ledgerId: "test-ledger-id",
    language: "zh-CN",
    categories: [
      { id: "cat-1", name: "餐饮", description: "外卖、堂食" },
      { id: "cat-2", name: "交通", description: "公交、地铁" },
      { id: "cat-3", name: "日用品", description: "生活必需品" },
      { id: "cat-4", name: "饮料", description: "咖啡、奶茶" },
    ],
  };

  beforeEach(() => {
    processor = new GeminiMessageProcessor();
    mockGenerateContent = vi.fn();
    vi.mocked(getGeminiClient).mockReturnValue({
      generateContent: mockGenerateContent,
    } as any);
  });

  describe("process()", () => {
    it("should parse single transaction from text input", async () => {
      const input: MessageInput = { text: "午餐花了25.5元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toEqual({
        itemName: "午餐",
        amount: 25.5,
        currency: "CNY",
        category: "餐饮",
        transactionDate: "2025-01-25",
      });
    });

    it("should parse multiple transactions", async () => {
      const input: MessageInput = { text: "超市购物：牛奶15元，面包8元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.multipleTransactions);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].itemName).toBe("牛奶");
      expect(result.transactions[1].itemName).toBe("面包");
    });

    it("should handle markdown-wrapped JSON response", async () => {
      const input: MessageInput = { text: "咖啡30元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.markdownWrapped);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].itemName).toBe("咖啡");
      expect(result.transactions[0].amount).toBe(30);
    });

    it("should return empty array on invalid JSON response", async () => {
      const input: MessageInput = { text: "invalid input" };

      mockGenerateContent.mockResolvedValue("Sorry, I cannot parse this.");

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(0);
      expect(result.rawResponse).toBe("Sorry, I cannot parse this.");
    });

    it("should return empty array on empty response", async () => {
      const input: MessageInput = { text: "no transactions" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.emptyTransactions);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(0);
    });

    it("should handle foreign currency", async () => {
      const input: MessageInput = { text: "Coffee $4.50" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.foreignCurrency);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].currency).toBe("USD");
      expect(result.transactions[0].amount).toBe(4.5);
    });

    it("should include rawResponse in result", async () => {
      const input: MessageInput = { text: "test" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.rawResponse).toBe(MOCK_RESPONSES.singleTransaction);
    });

    it("should call generateContent with system prompt and parts", async () => {
      const input: MessageInput = { text: "午餐25元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const [systemPrompt, parts] = mockGenerateContent.mock.calls[0];
      expect(systemPrompt).toContain("简体中文");
      expect(systemPrompt).toContain("餐饮");
      expect(parts).toContainEqual({ text: "午餐25元" });
    });

    it("should handle image input", async () => {
      const input: MessageInput = {
        images: [
          {
            data: "data:image/jpeg;base64,/9j/4AAQSkZ...",
            mimeType: "image/jpeg",
          },
        ],
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(1);
      expect(mockGenerateContent).toHaveBeenCalled();

      const [, parts] = mockGenerateContent.mock.calls[0];
      expect(parts).toContainEqual({
        inlineData: {
          mimeType: "image/jpeg",
          data: "/9j/4AAQSkZ...",
        },
      });
    });

    it("should handle raw base64 image (without data URL prefix)", async () => {
      const input: MessageInput = {
        images: [
          {
            data: "/9j/4AAQSkZ...",
            mimeType: "image/jpeg",
          },
        ],
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      const [, parts] = mockGenerateContent.mock.calls[0];
      expect(parts).toContainEqual({
        inlineData: {
          mimeType: "image/jpeg",
          data: "/9j/4AAQSkZ...",
        },
      });
    });

    it("should handle audio input", async () => {
      const input: MessageInput = {
        audio: {
          data: "data:audio/webm;base64,GkXfo59...",
          mimeType: "audio/webm",
        },
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      const [, parts] = mockGenerateContent.mock.calls[0];
      expect(parts).toContainEqual({
        inlineData: {
          mimeType: "audio/webm",
          data: "GkXfo59...",
        },
      });
    });

    it("should add placeholder text when no input provided", async () => {
      const input: MessageInput = {};

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.emptyTransactions);

      await processor.process(input, defaultContext);

      const [, parts] = mockGenerateContent.mock.calls[0];
      expect(parts).toContainEqual({ text: "（无输入内容）" });
    });

    it("should handle mixed input (text + image)", async () => {
      const input: MessageInput = {
        text: "这是小票",
        images: [
          {
            data: "data:image/png;base64,iVBORw0KGgo...",
            mimeType: "image/png",
          },
        ],
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      const [, parts] = mockGenerateContent.mock.calls[0];
      expect(parts).toHaveLength(2);
      expect(parts).toContainEqual({ text: "这是小票" });
      expect(parts).toContainEqual({
        inlineData: {
          mimeType: "image/png",
          data: "iVBORw0KGgo...",
        },
      });
    });
  });

  describe("parseResponse() - edge cases", () => {
    it("should handle null currency in response", async () => {
      const input: MessageInput = { text: "some expense" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          transactions: [
            {
              item_name: "Unknown Item",
              amount: 50,
              currency: null,
              category: null,
              transaction_date: null,
            },
          ],
        })
      );

      const result = await processor.process(input, defaultContext);

      expect(result.transactions[0].currency).toBeNull();
      expect(result.transactions[0].category).toBeNull();
      expect(result.transactions[0].transactionDate).toBeNull();
    });

    it("should reject negative amounts via Zod validation", async () => {
      const input: MessageInput = { text: "refund" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          transactions: [
            {
              item_name: "Refund",
              amount: -50,
              currency: "CNY",
              category: null,
              transaction_date: null,
            },
          ],
        })
      );

      const result = await processor.process(input, defaultContext);

      // Should return empty due to validation failure
      expect(result.transactions).toHaveLength(0);
    });

    it("should reject zero amount via Zod validation", async () => {
      const input: MessageInput = { text: "free item" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          transactions: [
            {
              item_name: "Free Item",
              amount: 0,
              currency: "CNY",
              category: null,
              transaction_date: null,
            },
          ],
        })
      );

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(0);
    });

    it("should handle malformed JSON gracefully", async () => {
      const input: MessageInput = { text: "test" };

      mockGenerateContent.mockResolvedValue('{"transactions": [');

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(0);
    });

    it("should handle response with only ``` markers", async () => {
      const input: MessageInput = { text: "test" };

      mockGenerateContent.mockResolvedValue(`\`\`\`
${MOCK_RESPONSES.singleTransaction}
\`\`\``);

      const result = await processor.process(input, defaultContext);

      expect(result.transactions).toHaveLength(1);
    });
  });
});

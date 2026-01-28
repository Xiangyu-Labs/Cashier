import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAISourceDocumentProcessor } from "@/lib/message-processor/processor";
import { SourceDocumentInput, ProcessorContext } from "@/lib/message-processor/types";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";

// Mock the OpenAI client
vi.mock("@/lib/ai/openai", () => ({
  getOpenAIClient: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

import { getOpenAIClient } from "@/lib/ai/openai";

describe("OpenAIMessageProcessor", () => {
  let processor: OpenAISourceDocumentProcessor;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const defaultContext: ProcessorContext = {
    categories: [
      { id: "cat-1", name: "餐饮", description: "外卖、堂食" },
      { id: "cat-2", name: "交通", description: "公交、地铁" },
      { id: "cat-3", name: "日用品", description: "生活必需品" },
      { id: "cat-4", name: "饮料", description: "咖啡、奶茶" },
    ],
  };

  beforeEach(() => {
    processor = new OpenAISourceDocumentProcessor();
    mockGenerateContent = vi.fn();
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: mockGenerateContent,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  describe("process()", () => {
    it("should parse single transaction from text input", async () => {
      const input: SourceDocumentInput = { text: "午餐花了25.5元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0]).toEqual({
        itemName: "午餐",
        amount: 25.5,
        currency: "CNY",
        category: "餐饮",
        entryDate: "2025-01-25",
        notes: null,
      });
    });

    it("should parse transaction with notes (replaces metadata)", async () => {
      const input: SourceDocumentInput = { text: "苹果2公斤，每公斤10元" };

      // Mock response that puts details in notes
      const response = JSON.stringify({
        ledger_entries: [
          {
            item_name: "苹果",
            amount: 20,
            currency: "CNY",
            category: "餐饮",
            entry_date: "2025-01-25",
            notes: "2kg * 10元/kg, 红富士苹果",
          },
        ],
      });

      mockGenerateContent.mockResolvedValue(response);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      const tx = result.ledgerEntries[0];
      expect(tx.itemName).toBe("苹果");
      expect(tx.notes).toContain("2kg");
      expect(tx.notes).toContain("10元");
    });

    it("should parse transaction with explicit notes", async () => {
      const input: SourceDocumentInput = { text: "买了一箱牛奶，每盒5元，一共24盒，大家平分" };

      const responseWithNotes = JSON.stringify({
        ledger_entries: [
          {
            item_name: "牛奶",
            amount: 120,
            currency: "CNY",
            category: "餐饮",
            entry_date: "2025-01-25",
            notes: "24盒 * 5元/盒; 大家平分",
          },
        ],
      });

      mockGenerateContent.mockResolvedValue(responseWithNotes);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      const tx = result.ledgerEntries[0];
      expect(tx.itemName).toBe("牛奶");
      expect(tx.notes).toContain("大家平分");
      expect(tx.notes).toContain("24盒");
    });

    it("should parse multiple ledger entries", async () => {
      const input: SourceDocumentInput = { text: "超市购物：牛奶15元，面包8元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.multipleTransactions);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(2);
      expect(result.ledgerEntries[0].itemName).toBe("牛奶");
      expect(result.ledgerEntries[1].itemName).toBe("面包");
    });

    it("should handle markdown-wrapped JSON response", async () => {
      const input: SourceDocumentInput = { text: "咖啡30元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.markdownWrapped);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0].itemName).toBe("咖啡");
      expect(result.ledgerEntries[0].amount).toBe(30);
    });

    it("should throw error on invalid JSON response", async () => {
      const input: SourceDocumentInput = { text: "invalid input" };

      mockGenerateContent.mockResolvedValue("Sorry, I cannot parse this.");

      await expect(processor.process(input, defaultContext)).rejects.toThrow("Failed to parse AI response");
    });

    it("should return empty array on empty response", async () => {
      const input: SourceDocumentInput = { text: "no transactions" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.emptyTransactions);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(0);
    });

    it("should handle foreign currency", async () => {
      const input: SourceDocumentInput = { text: "Coffee .50" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.foreignCurrency);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0].currency).toBe("USD");
      expect(result.ledgerEntries[0].amount).toBe(4.5);
    });

    it("should include rawResponse in result", async () => {
      const input: SourceDocumentInput = { text: "test" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.rawResponse).toBe(MOCK_RESPONSES.singleTransaction);
    });

    it("should call generateContent with system prompt and messages", async () => {
      const input: SourceDocumentInput = { text: "午餐25元" };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const [systemPrompt, messages] = mockGenerateContent.mock.calls[0];
      expect(systemPrompt).toContain("餐饮");
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toHaveLength(1);
      expect(messages[0].content[0]).toEqual({ type: "text", text: "午餐25元" });
    });

    it("should handle image input", async () => {
      const input: SourceDocumentInput = {
        images: [
          {
            data: "data:image/jpeg;base64,/9j/4AAQSkZ...",
            mimeType: "image/jpeg",
          },
        ],
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
      expect(mockGenerateContent).toHaveBeenCalled();

      const [, messages] = mockGenerateContent.mock.calls[0];
      const content = messages[0].content;
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,/9j/4AAQSkZ...",
        },
      });
    });

    it("should handle raw base64 image (without data URL prefix)", async () => {
      const input: SourceDocumentInput = {
        images: [
          {
            data: "/9j/4AAQSkZ...",
            mimeType: "image/jpeg",
          },
        ],
      };

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.singleTransaction);

      await processor.process(input, defaultContext);

      const [, messages] = mockGenerateContent.mock.calls[0];
      const content = messages[0].content;
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,/9j/4AAQSkZ...",
        },
      });
    });

    it("should add placeholder text when no input provided", async () => {
      const input: SourceDocumentInput = {};

      mockGenerateContent.mockResolvedValue(MOCK_RESPONSES.emptyTransactions);

      await processor.process(input, defaultContext);

      const [, messages] = mockGenerateContent.mock.calls[0];
      const content = messages[0].content;
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: "text", text: "（无输入内容）" });
    });

    it("should handle mixed input (text + image)", async () => {
      const input: SourceDocumentInput = {
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

      const [, messages] = mockGenerateContent.mock.calls[0];
      const content = messages[0].content;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({ type: "text", text: "这是小票" });
      expect(content[1]).toEqual({
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgo...",
        },
      });

    });

    // AutoConfirm test removed as status field is removed from ParsedTransaction
  });

  describe("parseResponse() - edge cases", () => {
    it("should handle null currency in response", async () => {
      const input: SourceDocumentInput = { text: "some expense" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          ledger_entries: [
            {
              item_name: "Unknown Item",
              amount: 50,
              currency: null,
              category: null,
              entry_date: null,
            },
          ],
        })
      );

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries[0].currency).toBeNull();
      expect(result.ledgerEntries[0].category).toBeNull();
      expect(result.ledgerEntries[0].entryDate).toBeNull();
    });

    it("should reject negative amounts via Zod validation", async () => {
      const input: SourceDocumentInput = { text: "refund" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          ledger_entries: [
            {
              item_name: "Refund",
              amount: -50,
              currency: "CNY",
              category: null,
              entry_date: null,
            },
          ],
        })
      );

      // Should throw due to validation failure
      await expect(processor.process(input, defaultContext)).rejects.toThrow("Failed to parse AI response");
    });

    it("should accept zero amount via Zod validation", async () => {
      const input: SourceDocumentInput = { text: "free item" };

      mockGenerateContent.mockResolvedValue(
        JSON.stringify({
          ledger_entries: [
            {
              item_name: "Free Item",
              amount: 0,
              currency: "CNY",
              category: null,
              entry_date: null,
            },
          ],
        })
      );

      const result = await processor.process(input, defaultContext);
      expect(result.ledgerEntries[0].amount).toBe(0);
    });

    it("should handle malformed JSON gracefully", async () => {
      const input: SourceDocumentInput = { text: "test" };

      mockGenerateContent.mockResolvedValue('{"transactions": [');

      await expect(processor.process(input, defaultContext)).rejects.toThrow("Failed to parse AI response");
    });

    it("should handle response with only ``` markers", async () => {
      const input: SourceDocumentInput = { text: "test" };

      mockGenerateContent.mockResolvedValue(`\`\`\`
${MOCK_RESPONSES.singleTransaction}
\`\`\``);

      const result = await processor.process(input, defaultContext);

      expect(result.ledgerEntries).toHaveLength(1);
    });
  });
});

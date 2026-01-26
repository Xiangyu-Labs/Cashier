import { vi } from "vitest";

export interface MockGeminiResponse {
  transactions: Array<{
    item_name: string;
    amount: number;
    currency: string | null;
    category: string | null;
    transaction_date: string | null;
    quantity?: number;
    unit_price?: number;
    unit?: string;
    original_name?: string;
  }>;
}

export function mockGeminiResponse(response: MockGeminiResponse): string {
  return JSON.stringify(response);
}

// Common test responses
export const MOCK_RESPONSES = {
  singleTransaction: mockGeminiResponse({
    transactions: [
      {
        item_name: "午餐",
        amount: 25.5,
        currency: "CNY",
        category: "餐饮",
        transaction_date: "2025-01-25",
      },
    ],
  }),

  transactionWithMetadata: mockGeminiResponse({
    transactions: [
      {
        item_name: "苹果",
        amount: 20,
        currency: "CNY",
        category: "水果",
        transaction_date: "2025-01-25",
        quantity: 2,
        unit_price: 10,
        unit: "kg",
        original_name: "红富士苹果",
      },
    ],
  }),

  multipleTransactions: mockGeminiResponse({
    transactions: [
      {
        item_name: "牛奶",
        amount: 15,
        currency: "CNY",
        category: "日用品",
        transaction_date: null,
      },
      {
        item_name: "面包",
        amount: 8,
        currency: "CNY",
        category: "餐饮",
        transaction_date: null,
      },
    ],
  }),

  emptyTransactions: mockGeminiResponse({ transactions: [] }),

  foreignCurrency: mockGeminiResponse({
    transactions: [
      {
        item_name: "Coffee",
        amount: 4.5,
        currency: "USD",
        category: "饮料",
        transaction_date: "2025-01-25",
      },
    ],
  }),

  markdownWrapped: `\`\`\`json
{
  "transactions": [{
    "item_name": "咖啡",
    "amount": 30,
    "currency": "CNY",
    "category": "饮料",
    "transaction_date": null
  }]
}
\`\`\``,
};

// Create a mock Gemini client
export function createMockGeminiClient(mockResponse: string = MOCK_RESPONSES.singleTransaction) {
  return {
    generateContent: vi.fn().mockResolvedValue(mockResponse),
  };
}

// Setup Gemini mock for tests
export function setupGeminiMock(mockResponse: string = MOCK_RESPONSES.singleTransaction) {
  const mockClient = createMockGeminiClient(mockResponse);

  vi.doMock("@/lib/ai/gemini", () => ({
    getGeminiClient: () => mockClient,
    GeminiClient: vi.fn().mockImplementation(() => mockClient),
  }));

  return mockClient;
}

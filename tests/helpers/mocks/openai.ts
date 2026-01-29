import { vi } from "vitest";

export interface MockOpenAIResponse {
    ledger_entries: Array<{
        item_name: string;
        amount: number;
        currency: string | null;
        category: string;
        entry_date: string | null;
        notes?: string;
    }>;
    title?: string;
    is_valid?: boolean;
}

export function mockOpenAIResponse(response: MockOpenAIResponse): string {
    return JSON.stringify({
        is_valid: true, // Default to true for mocks unless specified
        ...response
    });
}

// Common test responses
export const MOCK_RESPONSES = {
    singleEntry: mockOpenAIResponse({
        ledger_entries: [
            {
                item_name: "午餐",
                amount: 25.5,
                currency: "CNY",
                category: "餐饮",
                entry_date: "2025-01-25",
            },
        ],
        title: "午餐消费",
    }),

    entryWithMetadata: mockOpenAIResponse({
        ledger_entries: [
            {
                item_name: "苹果",
                amount: 20,
                currency: "CNY",
                category: "水果",
                entry_date: "2025-01-25",
                notes: "2kg * 10元/kg, 红富士苹果"
            },
        ],
    }),

    multipleEntries: mockOpenAIResponse({
        ledger_entries: [
            {
                item_name: "牛奶",
                amount: 15,
                currency: "CNY",
                category: "日用",
                entry_date: null,
            },
            {
                item_name: "面包",
                amount: 8,
                currency: "CNY",
                category: "餐饮",
                entry_date: null,
            },
        ],
        title: "超市购物",
    }),

    emptyEntries: mockOpenAIResponse({ ledger_entries: [] }),

    foreignCurrency: mockOpenAIResponse({
        ledger_entries: [
            {
                item_name: "Coffee",
                amount: 4.5,
                currency: "USD",
                category: "饮料",
                entry_date: "2025-01-25",
            },
        ],
    }),

    markdownWrapped: `\`\`\`json
{
  "is_valid": true,
  "ledger_entries": [{
    "item_name": "咖啡",
    "amount": 30,
    "currency": "CNY",
    "category": "饮料",
    "entry_date": null
  }]
}
\`\`\``,
};

// Create a mock OpenAI client
export function createMockOpenAIClient(mockResponse: string = MOCK_RESPONSES.singleEntry) {
    return {
        generateContent: vi.fn().mockResolvedValue({ content: mockResponse }),
    };
}

// Setup OpenAI mock for tests
export function setupOpenAIMock(mockResponse: string = MOCK_RESPONSES.singleEntry) {
    const mockClient = createMockOpenAIClient(mockResponse);

    vi.doMock("@/lib/ai/openai", () => ({
        getOpenAIClient: () => mockClient,
        OpenAIClient: vi.fn().mockImplementation(() => mockClient),
    }));

    return mockClient;
}

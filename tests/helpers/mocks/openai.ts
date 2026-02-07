import { vi } from "vitest";

/**
 * Multi-stage Mock AI for Integration Tests
 * 
 * Creates a mock that returns different responses based on the system prompt,
 * supporting the new multi-stage parsing architecture.
 */

export interface MockEntryData {
    item_name: string;
    amount: number;
    currency?: string;
    category_index?: number;
    entry_date?: string | null;
    notes?: string | null;
}

export interface MultiStageMockOptions {
    /** Should the document be valid? (Stage 1.1) */
    isValid?: boolean;
    /** Should the document be complete? (Stage 1.2) */
    isComplete?: boolean;
    /** Incomplete reason if not complete */
    incompleteReason?: string;
    /** Currencies to detect (Stage 1.3) */
    currencies?: string[];
    /** Categories to detect (Stage 1.4) */
    categories?: string[];
    /** Document title (Stage 1.5) */
    title?: string;
    /** User requirements rules (Stage 1.6) */
    rules?: string[];
    /** Ledger entries (Stage 2) */
    entries?: MockEntryData[];
}

const DEFAULT_OPTIONS: Required<Omit<MultiStageMockOptions, 'incompleteReason' | 'rules'>> = {
    isValid: true,
    isComplete: true,
    currencies: ["CNY"],
    categories: ["餐饮"],
    title: "测试账单",
    entries: [{
        item_name: "午餐",
        amount: 25.50,
        currency: "CNY",
        category_index: 1,
        entry_date: new Date().toISOString().split('T')[0],
        notes: null
    }]
};

/**
 * Create a mock OpenAI client that handles multi-stage AI calls
 */
export function createMultiStageMock(options: MultiStageMockOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return {
        generateContent: vi.fn().mockImplementation((
            _prompt: string,
            _messages: unknown[],
            _model: string,
            _maxTokens: number,
            _temperature: number,
            _responseFormat: unknown,
            _signal: AbortSignal
        ) => {
            const prompt = _prompt.toLowerCase();

            // Stage 1.5: Validation (reviews Stage 1 results)
            // MUST check FIRST - prompt contains "validation ai that reviews"
            if ((prompt.includes('validation') && prompt.includes('reviews')) || prompt.includes('veto power')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        is_reasonable: true,
                        summary: {
                            title: opts.title,
                            currencies: opts.currencies.map(c => ({
                                code: c,
                                hint: `Identified ${c} from input`
                            })),
                            categories: opts.categories.map(c => ({
                                name: c,
                                hint: `Category matches content`
                            })),
                            rules: []
                        }
                    }),
                    usage: { promptTokens: 150, completionTokens: 80 }
                });
            }

            // Stage 2: Detailed Parse - detect BEFORE Stage 1.3/1.4 as it contains their keywords
            // Unique keywords: "detailed financial document parser" or "ledger entries" or "pre-analysis context"
            if (prompt.includes('detailed financial document parser') ||
                prompt.includes('ledger_entries') ||
                prompt.includes('pre-analysis context')) {
                const currentDate = new Date().toISOString().split('T')[0];
                return Promise.resolve({
                    content: JSON.stringify({
                        ledger_entries: opts.entries.map((e, index) => ({
                            item_name: e.item_name,
                            amount: e.amount,
                            currency: e.currency || opts.currencies[0] || "CNY",
                            category_index: e.category_index ?? (index + 1),
                            entry_date: e.entry_date === undefined ? currentDate : e.entry_date,
                            notes: e.notes ?? null
                        })),
                        reasoning: "Parsed expense entries from document"
                    }),
                    usage: { promptTokens: 200, completionTokens: 100 }
                });
            }

            // Stage 1.1: Validity Check
            if (prompt.includes('validity') || prompt.includes('valid financial')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        is_valid: opts.isValid,
                        reasoning: opts.isValid
                            ? "Document contains clear expense information"
                            : "No financial data found"
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 1.2: Completeness Check
            if (prompt.includes('complete') || prompt.includes('missing content')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        is_complete: opts.isComplete ?? true,
                        ...(opts.incompleteReason && !opts.isComplete ? { issue: opts.incompleteReason } : {})
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 1.3: Currency Recognition
            if (prompt.includes('currency') || prompt.includes('currencies')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        currencies: opts.currencies,
                        reasoning: `Detected currencies: ${opts.currencies.join(', ')}`
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 1.4: Category Recognition
            if (prompt.includes('category') || prompt.includes('categories')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        categories: opts.categories,
                        reasoning: `Matched categories: ${opts.categories.join(', ')}`
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 1.5: Title Extraction
            if (prompt.includes('title') || prompt.includes('concise summary')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        title: opts.title
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 1.6: User Requirements
            if (prompt.includes('user requirement') || prompt.includes('custom prompt')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        rules: opts.rules || []
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Arbitration
            if (prompt.includes('arbitration') || prompt.includes('gpt 1 result')) {
                return Promise.resolve({
                    content: JSON.stringify({
                        choice: 1,
                        reason: "GPT 1 result is more accurate"
                    }),
                    usage: { promptTokens: 100, completionTokens: 50 }
                });
            }

            // Stage 2: Detailed Parse (default response)
            const currentDate = new Date().toISOString().split('T')[0];
            return Promise.resolve({
                content: JSON.stringify({
                    ledger_entries: opts.entries.map((e, index) => ({
                        item_name: e.item_name,
                        amount: e.amount,
                        currency: e.currency || opts.currencies[0] || "CNY",
                        category_index: e.category_index ?? (index + 1),
                        entry_date: e.entry_date === undefined ? currentDate : e.entry_date,
                        notes: e.notes ?? null
                    })),
                    reasoning: "Parsed expense entries from document"
                }),
                usage: { promptTokens: 200, completionTokens: 100 }
            });
        })
    };
}

/**
 * Default multi-stage mock for simple test cases
 */
export const defaultMultiStageMock = createMultiStageMock();

// Legacy compatibility exports
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
        is_valid: true,
        reasoning: "Valid expense document",
        ...response
    });
}

// Common test responses (legacy format - still included for backward compatibility)
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
};

// Create a mock OpenAI client (legacy)
export function createMockOpenAIClient(mockResponse: string = MOCK_RESPONSES.singleEntry) {
    return {
        generateContent: vi.fn().mockResolvedValue({ content: mockResponse }),
    };
}

// Setup OpenAI mock for tests (legacy)
export function setupOpenAIMock(mockResponse: string = MOCK_RESPONSES.singleEntry) {
    const mockClient = createMockOpenAIClient(mockResponse);

    vi.doMock("@/features/ai/server/services/openai", () => ({
        getOpenAIClient: () => mockClient,
        OpenAIClient: vi.fn().mockImplementation(() => mockClient),
    }));

    return mockClient;
}

import { describe, it, expect, vi } from "vitest";
import { summarizeLedgerEntries } from "@/features/ai/server/utils/utils";
import { ParsedLedgerEntry } from "@/features/ai/server/types";
import { getOpenAIClient } from "@/features/ai/server/services/openai";

vi.mock("@/features/ai/server/services/openai", () => ({
    getOpenAIClient: vi.fn(),
}));

describe("summarizeLedgerEntries", () => {
    let mockGenerateContent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockGenerateContent = vi.fn();
        // The mock structure for OpenAI client has changed to accommodate the new API structure
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: mockGenerateContent,
        } as unknown as never);
    });

    it("should group and summarize entries with same date, category, and currency", async () => {
        const entries: ParsedLedgerEntry[] = [
            { itemName: "Item 1", amount: 10, currency: "CNY", category: "Food", entryDate: "2025-01-25", notes: "Note 1" },
            { itemName: "Item 2", amount: 20, currency: "CNY", category: "Food", entryDate: "2025-01-25", notes: "Note 2" },
        ];

        mockGenerateContent.mockResolvedValue({
            content: JSON.stringify({
                item_name: "Summarized Food",
                notes: "Combined notes"
            })
        });

        const result = await summarizeLedgerEntries(entries, "zh-CN");

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            itemName: "Summarized Food",
            amount: 30,
            currency: "CNY",
            category: "Food",
            entryDate: "2025-01-25",
            notes: "Combined notes"
        });
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("should NOT group entries with different currencies", async () => {
        const entries: ParsedLedgerEntry[] = [
            { itemName: "Item 1", amount: 10, currency: "CNY", category: "Food", entryDate: "2025-01-25", notes: "Note 1" },
            { itemName: "Item 2", amount: 20, currency: "USD", category: "Food", entryDate: "2025-01-25", notes: "Note 2" },
        ];

        const result = await summarizeLedgerEntries(entries, "zh-CN");

        expect(result).toHaveLength(2);
        expect(result[0].currency).toBe("CNY");
        expect(result[1].currency).toBe("USD");
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it("should NOT group entries with different dates", async () => {
        const entries: ParsedLedgerEntry[] = [
            { itemName: "Item 1", amount: 10, currency: "CNY", category: "Food", entryDate: "2025-01-25", notes: "Note 1" },
            { itemName: "Item 2", amount: 20, currency: "CNY", category: "Food", entryDate: "2025-01-26", notes: "Note 2" },
        ];

        const result = await summarizeLedgerEntries(entries, "zh-CN");

        expect(result).toHaveLength(2);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it("should NOT group entries with different categories", async () => {
        const entries: ParsedLedgerEntry[] = [
            { itemName: "Item 1", amount: 10, currency: "CNY", category: "Food", entryDate: "2025-01-25", notes: "Note 1" },
            { itemName: "Item 2", amount: 20, currency: "CNY", category: "Travel", entryDate: "2025-01-25", notes: "Note 2" },
        ];

        const result = await summarizeLedgerEntries(entries, "zh-CN");

        expect(result).toHaveLength(2);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });
});

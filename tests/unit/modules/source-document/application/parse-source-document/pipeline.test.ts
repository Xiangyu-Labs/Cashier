import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import { buildStageContext } from "@/modules/source-document/application/parse-source-document/context";
import { executeParseSourceDocument } from "@/modules/source-document/application/parse-source-document/execute";
import { buildStage1Input } from "@/modules/source-document/application/parse-source-document/pipeline";

function createMultiStageMockAI(options: {
  isValid?: boolean;
  currencies?: string[];
  categories?: string[];
  title?: string;
  entries?: Array<{
    item_name: string;
    amount: number;
    currency: string;
    category_index: number;
    entry_date: string;
    notes: string | null;
  }>;
  stage1_5Reasonable?: boolean;
  stage2ArbitrationFails?: boolean;
}): { ai: AIContext; generate: ReturnType<typeof vi.fn> } {
  const {
    isValid = true,
    currencies = ["USD"],
    categories = ["Food"],
    title = "Test Document",
    entries = [
      {
        item_name: "Lunch",
        amount: 10,
        currency: "USD",
        category_index: 1,
        entry_date: "2024-01-01",
        notes: null,
      },
    ],
    stage1_5Reasonable = true,
    stage2ArbitrationFails = false,
  } = options;

  let stage2CallCount = 0;

  const generate = vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
    const prompt = opts.prompt ?? "";

    if (prompt.includes("You are a validation AI")) {
      return {
        content: JSON.stringify({
          is_reasonable: stage1_5Reasonable,
          summary: stage1_5Reasonable
            ? {
                title,
                currencies: currencies.map((currency) => ({ code: currency, hint: "detected" })),
                categories: categories.map((category) => ({ name: category, hint: "matched" })),
              }
            : undefined,
          rejection_reason: stage1_5Reasonable ? undefined : "Results inconsistent",
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("You are a detailed financial document parser")) {
      stage2CallCount += 1;
      if (stage2ArbitrationFails && stage2CallCount <= 2) {
        const modifiedEntries =
          stage2CallCount === 1
            ? entries
            : entries.map((entry) => ({ ...entry, amount: entry.amount * 2 }));
        return {
          content: JSON.stringify({ ledger_entries: modifiedEntries, reasoning: "Parsed" }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      return {
        content: JSON.stringify({ ledger_entries: entries, reasoning: "Parsed successfully" }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("financial document validation")) {
      return {
        content: JSON.stringify({
          is_valid: isValid,
          reasoning: isValid ? "Valid document" : "Invalid document",
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("completeness checker")) {
      return {
        content: JSON.stringify({ is_complete: true }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("You are a currency recognition AI")) {
      return {
        content: JSON.stringify({ currencies, reasoning: "Currency detected" }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("You are a category recognition AI")) {
      return {
        content: JSON.stringify({ categories, reasoning: "Category matched" }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("title extraction")) {
      return {
        content: JSON.stringify({ title }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("user requirement")) {
      return {
        content: JSON.stringify({ rules: [] }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    if (prompt.includes("arbitration")) {
      return {
        content: JSON.stringify({ choice: stage2ArbitrationFails ? 0 : 1, reason: "Resolution" }),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }

    return {
      content: JSON.stringify({}),
      usage: { promptTokens: 100, completionTokens: 50 },
    };
  });

  return { ai: { generate }, generate };
}

function createInput(overrides: Partial<ParseSourceDocumentInput> = {}): ParseSourceDocumentInput {
  return {
    ledgerId: "ledger-1",
    sourceDocumentId: "source-doc-1",
    categories: [{ id: "cat-1", name: "Food", description: "Food stuff" }],
    settings: {},
    ...overrides,
  };
}

function createStageContext(ai: AIContext) {
  return buildStageContext({
    signal: new AbortController().signal,
    ai,
    setProgress: vi.fn(async () => {}),
    docId: "source-doc-1",
    ledgerId: "ledger-1",
  });
}

describe("executeParseSourceDocument", () => {
  it("skips stage 0 when no images are provided", async () => {
    const { ai, generate } = createMultiStageMockAI({});

    const result = await executeParseSourceDocument(createInput(), createStageContext(ai));

    expect(result.verificationStatus).toBe("passed");
    expect(generate.mock.calls.filter(([opts]) => opts.model === "vision")).toHaveLength(0);
  });

  it("returns parsed entries for the success path", async () => {
    const { ai } = createMultiStageMockAI({
      entries: [
        {
          item_name: "Lunch",
          amount: 10,
          currency: "USD",
          category_index: 1,
          entry_date: "2024-01-01",
          notes: null,
        },
      ],
      title: "Test Title",
    });

    const result = await executeParseSourceDocument(
      createInput({ aiLanguage: "en-US", preferredCurrencies: ["USD"] }),
      createStageContext(ai)
    );

    expect(result.ledgerEntries).toHaveLength(1);
    expect(result.ledgerEntries[0]?.itemName).toBe("Lunch");
    expect(result.ledgerEntries[0]?.entryDate).toBeNull();
    expect(result.title).toBe("Test Title");
    expect(result.verificationStatus).toBe("passed");
  });

  it("returns invalid when stage 1 rejects the document", async () => {
    const { ai } = createMultiStageMockAI({ isValid: false });

    const result = await executeParseSourceDocument(createInput(), createStageContext(ai));

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("invalid");
  });

  it("returns anomaly when stage 1.5 validation rejects the results", async () => {
    const { ai } = createMultiStageMockAI({ stage1_5Reasonable: false });

    const result = await executeParseSourceDocument(createInput(), createStageContext(ai));

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("anomaly");
    expect(result.anomalyReason).toContain("inconsistent");
  });

  it("returns anomaly when stage 2 arbitration fails", async () => {
    const { ai } = createMultiStageMockAI({ stage2ArbitrationFails: true });

    const result = await executeParseSourceDocument(createInput(), createStageContext(ai));

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("anomaly");
    expect("title" in result).toBe(false);
  });
});

describe("buildStage1Input", () => {
  it("normalizes categories and forwards optional fields", () => {
    const input = createInput({
      text: "user text",
      imageUrls: ["https://example.com/doc.png"],
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      settings: { aiCustomPrompt: "Prefer food-related detail" },
      categories: [{ id: "cat-1", name: "Food", description: null }],
    });

    const stage1Input = buildStage1Input(input, "vision summary");

    expect(stage1Input).toEqual({
      text: "user text",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      aiCustomPrompt: "Prefer food-related detail",
      categories: [{ name: "Food", description: null }],
    });
  });
});

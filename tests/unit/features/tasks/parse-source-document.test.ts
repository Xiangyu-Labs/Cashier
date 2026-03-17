import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseSourceDocumentHandler,
  type ParseSourceDocumentInput,
  type ParseSourceDocumentOutput,
} from "@/features/source-document/server/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  type FlowContext,
  type AIContext,
  type AIGenerateOptions,
  type AIResponse,
} from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";

/**
 * Smart mock that returns appropriate responses based on prompt content.
 * This mock handles the multi-stage architecture:
 * - Stage 1: Validity, Currency, Category, Title, User Requirements
 * - Stage 1.5: Validation
 * - Stage 2: Detailed parsing
 */
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
}): AIContext {
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

  return {
    generate: vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
      const prompt = opts.prompt ?? "";

      // Stage 1.5: Validation (check first due to containing Stage 1 result JSON)
      if (prompt.includes("You are a validation AI")) {
        return {
          content: JSON.stringify({
            is_reasonable: stage1_5Reasonable,
            summary: stage1_5Reasonable
              ? {
                  title,
                  currencies: currencies.map((c) => ({ code: c, hint: "detected" })),
                  categories: categories.map((c) => ({ name: c, hint: "matched" })),
                }
              : undefined,
            rejection_reason: stage1_5Reasonable ? undefined : "Results inconsistent",
          }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 2: Detailed parsing (check before Stage 1 arbitration)
      if (prompt.includes("You are a detailed financial document parser")) {
        stage2CallCount++;
        if (stage2ArbitrationFails && stage2CallCount <= 2) {
          // Return different results to trigger arbitration
          const modifiedEntries =
            stage2CallCount === 1 ? entries : entries.map((e) => ({ ...e, amount: e.amount * 2 }));
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

      // Stage 1: Validity check
      if (prompt.includes("financial document validation") ?? false) {
        return {
          content: JSON.stringify({
            is_valid: isValid,
            reasoning: isValid ? "Valid document" : "Invalid document",
          }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 1: Completeness check
      if (prompt.includes("completeness checker")) {
        return {
          content: JSON.stringify({ is_complete: true }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 1: Currency recognition
      if (prompt.includes("You are a currency recognition AI")) {
        return {
          content: JSON.stringify({ currencies, reasoning: "Currency detected" }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 1: Category recognition
      if (prompt.includes("You are a category recognition AI")) {
        return {
          content: JSON.stringify({ categories, reasoning: "Category matched" }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 1: Title extraction
      if (prompt.includes("title extraction")) {
        return {
          content: JSON.stringify({ title }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Stage 1: User requirements
      if (prompt.includes("user requirement")) {
        return {
          content: JSON.stringify({ rules: [] }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Arbitration (any stage)
      if (prompt.includes("arbitration")) {
        return {
          content: JSON.stringify({ choice: stage2ArbitrationFails ? 0 : 1, reason: "Resolution" }),
          usage: { promptTokens: 100, completionTokens: 50 },
        };
      }

      // Default fallback
      return {
        content: JSON.stringify({}),
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }),
  };
}

describe("parseSourceDocumentHandler.execute", () => {
  let sourceDocId: string;
  let categoryId: string;
  let currentLedgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup real DB data
    const db = getTestDb();
    // Use random email to avoid unique constraint conflicts
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger");
    currentLedgerId = ledgerId;
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        status: "processing",
      })
      .returning();
    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "Food",
        description: "Food stuff",
      })
      .returning();

    sourceDocId = sourceDoc.id;
    categoryId = category.id;
  });

  it("should parse entries using multi-stage architecture and return results", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      settings: {},
    };

    const mockAI = createMultiStageMockAI({
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

    const context = {
      updateProgress: vi.fn(),
      ledgerId: currentLedgerId,
      signal: { aborted: false },
      ai: mockAI,
      reportTokens: vi.fn(),
    } as unknown as FlowContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    expect(result.ledgerEntries).toHaveLength(1);
    expect(result.ledgerEntries[0].itemName).toBe("Lunch");
    expect(result.title).toBe("Test Title");
    expect(result.verificationStatus).toBe("passed");
  });

  it("should return null entryDate in execute (date is set from source document in onComplete)", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const mockAI = createMultiStageMockAI({
      entries: [
        {
          item_name: "Lunch",
          amount: 10,
          currency: "USD",
          category_index: 1,
          entry_date: "2020-01-01",
          notes: null,
        },
      ],
    });

    const context = {
      updateProgress: vi.fn(),
      ledgerId: currentLedgerId,
      signal: { aborted: false },
      ai: mockAI,
      reportTokens: vi.fn(),
    } as unknown as FlowContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    // entryDate is null in execute result - it will be set from source document in onComplete
    expect(result.ledgerEntries[0].entryDate).toBeNull();
  });

  it("should return invalid status if Stage 1 validity check fails", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const mockAI = createMultiStageMockAI({ isValid: false });

    const context = {
      updateProgress: vi.fn(),
      ledgerId: currentLedgerId,
      signal: { aborted: false },
      ai: mockAI,
      reportTokens: vi.fn(),
    } as unknown as FlowContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("invalid");
  });

  it("should return anomaly status if Stage 1.5 validation rejects", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const mockAI = createMultiStageMockAI({ stage1_5Reasonable: false });

    const context = {
      updateProgress: vi.fn(),
      ledgerId: currentLedgerId,
      signal: { aborted: false },
      ai: mockAI,
      reportTokens: vi.fn(),
    } as unknown as FlowContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("anomaly");
    expect(result.anomalyReason).toContain("inconsistent");
  });

  it("should return anomaly when Stage 2 arbitration fails", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const mockAI = createMultiStageMockAI({ stage2ArbitrationFails: true });

    const context = {
      updateProgress: vi.fn(),
      ledgerId: currentLedgerId,
      signal: { aborted: false },
      ai: mockAI,
      reportTokens: vi.fn(),
    } as unknown as FlowContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.verificationStatus).toBe("anomaly");
  });
});

describe("parseSourceDocumentHandler.onComplete", () => {
  let sourceDocId: string;
  let categoryId: string;
  let currentLedgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = getTestDb();
    // Use random email to avoid unique constraint conflicts
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Complete Test Ledger");
    currentLedgerId = ledgerId;
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        status: "processing",
      })
      .returning();
    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "Food",
        description: "Food stuff",
      })
      .returning();

    sourceDocId = sourceDoc.id;
    categoryId = category.id;
  });

  it("should save ledger entries and update document status on success", async () => {
    const db = getTestDb();

    const output: ParseSourceDocumentOutput = {
      ledgerEntries: [
        {
          itemName: "Lunch",
          amount: 10,
          currency: "USD",
          categoryIndex: 1,
          entryDate: "2024-01-01",
          notes: null,
        },
      ],
      title: "Test Title",
      verificationStatus: "passed",
    };

    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const context = {
      ledgerId: currentLedgerId,
    } as unknown as FlowContext;

    await parseSourceDocumentHandler.onComplete?.(output, input, context);

    // Check document status
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocId),
    });
    expect(doc?.status).toBe("completed");
    expect(doc?.title).toBe("Test Title");

    // Check ledger entries
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.sourceDocumentId, sourceDocId), isNull(ledgerEntries.deletedAt)));
    expect(entries).toHaveLength(1);
    expect(entries[0].itemName).toBe("Lunch");
  });

  it("should set anomaly status when verificationStatus is anomaly", async () => {
    const db = getTestDb();

    const output: ParseSourceDocumentOutput = {
      ledgerEntries: [],
      anomalyReason: "Results inconsistent",
      verificationStatus: "anomaly",
    };

    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const context = {
      ledgerId: currentLedgerId,
    } as unknown as FlowContext;

    await parseSourceDocumentHandler.onComplete?.(output, input, context);

    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocId),
    });
    expect(doc?.status).toBe("anomaly");
    expect(doc?.anomalyReason).toBe("Results inconsistent");
  });
});

import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import { buildStageContext, runParsePipeline, buildParserInput } from "@/modules/source-document/application/parse-source-document/pipeline";

// Mock DB so pipeline unit tests don't need a real database
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: vi.fn(async () => null),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  },
}));

// Mock image loading so pipeline tests don't need real storage
vi.mock("@/lib/storage/utils", () => ({
  loadImagesForAI: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({ url, dataUrl: `data:image/jpeg;base64,FAKE`, success: true }))
  ),
}));

const SIMPLE_ENTRY = {
  receipt_index: 0,
  item_name: "Lunch",
  amount: 10,
  currency: "USD",
  category_index: 1,
  notes: null,
};

const SIMPLE_STAGE0_RESULT = {
  outcome: "success",
  title: "Test Receipt",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: 10, currency: "USD" }],
  ledger_entries: [SIMPLE_ENTRY],
  order_adjustments: [],
  reasoning: "single item",
};

const COMPLEX_ENTRIES = [
  { receipt_index: 0, item_name: "A", amount: 10, currency: "USD", category_index: 1, notes: null },
  { receipt_index: 0, item_name: "B", amount: 20, currency: "USD", category_index: 1, notes: null },
  { receipt_index: 0, item_name: "C", amount: 30, currency: "USD", category_index: 1, notes: null },
  { receipt_index: 0, item_name: "D", amount: 40, currency: "USD", category_index: 1, notes: null },
];

const COMPLEX_STAGE0_RESULT = {
  ...SIMPLE_STAGE0_RESULT,
  receipt_totals: [{ receipt_index: 0, amount: 100, currency: "USD" }],
  ledger_entries: COMPLEX_ENTRIES,
};

/**
 * Creates a mock AI that routes by prompt content.
 * - stage0 parse prompt ("receipt and invoice parser"): returns stage0 result JSON
 * - arbitration prompt ("arbitration AI"): returns choice JSON
 */
function createMockAI(options: {
  stage0Result?: object;
  stage0SecondResult?: object; // if set, 2nd call returns this (for disagreement)
  arbitrationChoice?: number;
  stage0Outcome?: "success" | "invalid" | "anomaly";
} = {}): { ai: AIContext; generate: ReturnType<typeof vi.fn> } {
  const {
    stage0Result = SIMPLE_STAGE0_RESULT,
    stage0SecondResult,
    arbitrationChoice = 1,
    stage0Outcome,
  } = options;

  let stage0CallCount = 0;

  const generate = vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
    const prompt = opts.prompt ?? "";

    // Arbitration call
    if (prompt.includes("arbitration AI")) {
      return { content: JSON.stringify({ choice: arbitrationChoice, reason: "result 1 is correct" }) };
    }

    // Stage 0 single-pass
    if (prompt.includes("receipt and invoice parser")) {
      stage0CallCount++;
      const base = stage0Outcome != null
        ? { ...stage0Result, outcome: stage0Outcome }
        : stage0Result;
      if (stage0SecondResult && stage0CallCount >= 2) {
        return { content: JSON.stringify(stage0SecondResult) };
      }
      return { content: JSON.stringify(base) };
    }

    throw new Error(`Unexpected AI call with prompt: ${prompt.slice(0, 80)}`);
  });

  return { ai: { generate }, generate };
}

function createInput(overrides: Partial<ParseSourceDocumentInput> = {}): ParseSourceDocumentInput {
  return {
    ledgerId: "ledger-1",
    sourceDocumentId: "doc-1",
    categories: [{ id: "cat-1", name: "Food", description: null }],
    settings: {},
    text: "Lunch 10 USD",
    imageUrls: ["data:image/jpeg;base64,FAKE"],
    aiLanguage: "zh-CN",
    preferredCurrencies: ["USD"],
    ...overrides,
  };
}

function buildCtx(ai: AIContext) {
  return buildStageContext({
    signal: new AbortController().signal,
    ai,
    setProgress: vi.fn(async () => {}),
    docId: "source-doc-1",
    ledgerId: "ledger-1",
  });
}

describe("runParsePipeline — new single-pass flow", () => {
  it("returns success for simple document with one AI call", async () => {
    const { ai, generate } = createMockAI({ stage0Result: SIMPLE_STAGE0_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const stage0Calls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("receipt and invoice parser")
    );
    expect(stage0Calls).toHaveLength(1);
  });

  it("runs two parse calls for complex documents (>3 entries)", async () => {
    const { ai, generate } = createMockAI({ stage0Result: COMPLEX_STAGE0_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const stage0Calls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("receipt and invoice parser")
    );
    expect(stage0Calls).toHaveLength(2);
  });

  it("accepts agreeing complex results without arbitration", async () => {
    const { ai, generate } = createMockAI({ stage0Result: COMPLEX_STAGE0_RESULT });
    await runParsePipeline(createInput(), buildCtx(ai));

    const arbitrationCalls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("arbitration AI")
    );
    expect(arbitrationCalls).toHaveLength(0);
  });

  it("triggers arbitration when complex results disagree", async () => {
    const differentResult = {
      ...COMPLEX_STAGE0_RESULT,
      ledger_entries: COMPLEX_ENTRIES.map((e) => ({ ...e, amount: e.amount + 5 })),
    };
    const { ai, generate } = createMockAI({
      stage0Result: COMPLEX_STAGE0_RESULT,
      stage0SecondResult: differentResult,
    });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const arbitrationCalls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("arbitration AI")
    );
    expect(arbitrationCalls).toHaveLength(1);
  });

  it("invalid outcome short-circuits without dual-run", async () => {
    const { ai, generate } = createMockAI({ stage0Outcome: "invalid" });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("invalid");
    const stage0Calls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("receipt and invoice parser")
    );
    expect(stage0Calls).toHaveLength(1);
  });

  it("anomaly outcome returns anomaly result", async () => {
    const { ai } = createMockAI({
      stage0Result: {
        ...SIMPLE_STAGE0_RESULT,
        outcome: "anomaly",
        anomaly_reason: "Image too blurry",
        ledger_entries: [],
        receipt_totals: [],
      },
    });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("anomaly");
    if (result.kind === "anomaly") {
      expect(result.anomalyReason).toBe("Image too blurry");
    }
  });

  it("text-only input uses text model (no vision call)", async () => {
    const { ai, generate } = createMockAI({ stage0Result: SIMPLE_STAGE0_RESULT });
    await runParsePipeline(createInput({ imageUrls: undefined, text: "Lunch 10 USD" }), buildCtx(ai));

    const visionCalls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).model === "vision"
    );
    expect(visionCalls).toHaveLength(0);
    const textCalls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).model === "text"
    );
    expect(textCalls.length).toBeGreaterThan(0);
  });

  it("success result includes ledgerEntries from parse output", async () => {
    const { ai } = createMockAI({ stage0Result: SIMPLE_STAGE0_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0]?.amount).toBe(10);
    }
  });

  it("order_adjustments are folded proportionally into ledgerEntries", async () => {
    // SIMPLE_ENTRY: { receipt_index: 0, amount: 10, currency: "USD", item_name: "Lunch" }
    // adjustment: -2 USD on receipt 0 → single matching entry absorbs all → 10 + (-2) = 8
    const { ai } = createMockAI({
      stage0Result: {
        ...SIMPLE_STAGE0_RESULT,
        order_adjustments: [
          { receipt_index: 0, item_name: "Discount", amount: -2, currency: "USD" },
        ],
      },
    });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // No separate adjustment row — discount is folded into the entry
      expect(result.ledgerEntries.every((e) => !e.isAdjustment)).toBe(true);
      const entry = result.ledgerEntries.find((e) => e.itemName === "Lunch");
      expect(entry?.amount).toBe(8);
    }
  });

  it("cancellation returns cancelled result", async () => {
    const controller = new AbortController();
    const { ai } = createMockAI({});
    const ctx = buildStageContext({
      signal: controller.signal,
      ai,
      setProgress: vi.fn(async () => {
        controller.abort();
      }),
      docId: "source-doc-1",
      ledgerId: "ledger-1",
    });

    const result = await runParsePipeline(createInput(), ctx);
    expect(result.kind).toBe("cancelled");
  });
});

describe("buildParserInput", () => {
  it("includes categories, text, imageUrls, aiLanguage, preferredCurrencies, aiCustomPrompt", () => {
    const input = createInput({
      text: "user text",
      imageUrls: ["data:image/jpeg;base64,FAKE"],
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      settings: { aiCustomPrompt: "Prefer food-related detail" },
      categories: [{ id: "cat-1", name: "Food", description: null }],
    });

    const stage0Input = buildParserInput(input);

    expect(stage0Input.text).toBe("user text");
    expect(stage0Input.imageUrls).toEqual(["data:image/jpeg;base64,FAKE"]);
    expect(stage0Input.aiLanguage).toBe("en-US");
    expect(stage0Input.preferredCurrencies).toEqual(["USD"]);
    expect(stage0Input.aiCustomPrompt).toBe("Prefer food-related detail");
    expect(stage0Input.originalCategories).toEqual([{ name: "Food", description: null }]);
  });
});

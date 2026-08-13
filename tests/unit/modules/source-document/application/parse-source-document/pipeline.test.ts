import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/tasks/types";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/parse-source-document/contracts";
import {
  buildStageContext,
  runParsePipeline,
  buildParserInput,
} from "@/modules/source-document/application/parse-source-document/pipeline";

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

const SIMPLE_ENTRY = {
  receipt_index: 0,
  item_name: "Lunch",
  amount: "10",
  currency: "USD",
  category_index: 1,
  notes: null,
};

const SIMPLE_FIRST_PARSE_RESULT = {
  outcome: "success",
  title: "Test Receipt",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: "10", currency: "USD" }],
  ledger_entries: [SIMPLE_ENTRY],
  order_adjustments: [],
  reasoning: "single item",
};

const COMPLEX_ENTRIES = [
  {
    receipt_index: 0,
    item_name: "A",
    amount: "10",
    currency: "USD",
    category_index: 1,
    notes: null,
  },
  {
    receipt_index: 0,
    item_name: "B",
    amount: "20",
    currency: "USD",
    category_index: 1,
    notes: null,
  },
  {
    receipt_index: 0,
    item_name: "C",
    amount: "30",
    currency: "USD",
    category_index: 1,
    notes: null,
  },
  {
    receipt_index: 0,
    item_name: "D",
    amount: "40",
    currency: "USD",
    category_index: 1,
    notes: null,
  },
];

const COMPLEX_FIRST_PARSE_RESULT = {
  ...SIMPLE_FIRST_PARSE_RESULT,
  receipt_totals: [{ receipt_index: 0, amount: "100", currency: "USD" }],
  ledger_entries: COMPLEX_ENTRIES,
};

function isArbitrationPrompt(prompt: string | undefined): boolean {
  return prompt?.includes("arbitration AI") ?? false;
}

function isParserPrompt(prompt: string | undefined): boolean {
  return (
    prompt?.includes('"receipt_totals"') === true &&
    prompt.includes('"order_adjustments"') &&
    !isArbitrationPrompt(prompt)
  );
}

/**
 * Creates a mock AI that routes parser and arbitration calls by their output protocols.
 */
function createMockAI(
  options: {
    firstParseResult?: object;
    secondParseResult?: object; // if set, 2nd call returns this (for disagreement)
    arbitrationChoice?: number;
    firstParseOutcome?: "success" | "invalid" | "anomaly";
  } = {}
): { ai: AIContext; generate: ReturnType<typeof vi.fn> } {
  const {
    firstParseResult = SIMPLE_FIRST_PARSE_RESULT,
    secondParseResult,
    arbitrationChoice = 1,
    firstParseOutcome,
  } = options;

  let firstParseCallCount = 0;

  const generate = vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
    const prompt = opts.prompt ?? "";

    // Arbitration call
    if (isArbitrationPrompt(prompt)) {
      return {
        content: JSON.stringify({ choice: arbitrationChoice, reason: "result 1 is correct" }),
      };
    }

    // Single-pass parser
    if (isParserPrompt(prompt)) {
      firstParseCallCount++;
      const base =
        firstParseOutcome != null ? { ...firstParseResult, outcome: firstParseOutcome } : firstParseResult;
      if (secondParseResult && firstParseCallCount >= 2) {
        return { content: JSON.stringify(secondParseResult) };
      }
      return { content: JSON.stringify(base) };
    }

    throw new Error(`Unexpected AI call with prompt: ${prompt.slice(0, 80)}`);
  });

  return { ai: { generate }, generate };
}

type ParseSourceDocumentInputOverrides = {
  [K in keyof ParseSourceDocumentInput]?: ParseSourceDocumentInput[K] | undefined;
};

function createInput(overrides: ParseSourceDocumentInputOverrides = {}): ParseSourceDocumentInput {
  return {
    categories: overrides.categories ?? [{ id: "cat-1", name: "Food", description: null }],
    settings: overrides.settings ?? {},
    ...("text" in overrides
      ? overrides.text !== undefined
        ? { text: overrides.text }
        : {}
      : { text: "Lunch 10 USD" }),
    ...("evidence" in overrides
      ? overrides.evidence !== undefined
        ? { evidence: overrides.evidence }
        : {}
      : { evidence: { images: [{ dataUrl: "data:image/jpeg;base64,FAKE" }] } }),
    ...("aiLanguage" in overrides
      ? overrides.aiLanguage !== undefined
        ? { aiLanguage: overrides.aiLanguage }
        : {}
      : { aiLanguage: "zh-CN" }),
    ...("preferredCurrencies" in overrides
      ? overrides.preferredCurrencies !== undefined
        ? { preferredCurrencies: overrides.preferredCurrencies }
        : {}
      : { preferredCurrencies: ["USD"] }),
  };
}

function buildCtx(ai: AIContext) {
  return buildStageContext({
    signal: new AbortController().signal,
    ai,
    docId: "source-doc-1",
    ledgerId: "ledger-1",
  });
}

describe("runParsePipeline — new single-pass flow", () => {
  it("returns success for simple document with one AI call", async () => {
    const { ai, generate } = createMockAI({ firstParseResult: SIMPLE_FIRST_PARSE_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const firstParseCalls = generate.mock.calls.filter((c) =>
      isParserPrompt((c[0] as AIGenerateOptions).prompt)
    );
    expect(firstParseCalls).toHaveLength(1);
  });

  it("runs two parse calls for complex documents (>3 entries)", async () => {
    const { ai, generate } = createMockAI({ firstParseResult: COMPLEX_FIRST_PARSE_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const firstParseCalls = generate.mock.calls.filter((c) =>
      isParserPrompt((c[0] as AIGenerateOptions).prompt)
    );
    expect(firstParseCalls).toHaveLength(2);
  });

  it("accepts agreeing complex results without arbitration", async () => {
    const { ai, generate } = createMockAI({ firstParseResult: COMPLEX_FIRST_PARSE_RESULT });
    await runParsePipeline(createInput(), buildCtx(ai));

    const arbitrationCalls = generate.mock.calls.filter((c) =>
      isArbitrationPrompt((c[0] as AIGenerateOptions).prompt)
    );
    expect(arbitrationCalls).toHaveLength(0);
  });

  it("triggers arbitration when complex results disagree", async () => {
    const differentResult = {
      ...COMPLEX_FIRST_PARSE_RESULT,
      ledger_entries: COMPLEX_ENTRIES.map((e) => ({
        ...e,
        amount: String(Number.parseFloat(e.amount) + 5),
      })),
    };
    const { ai, generate } = createMockAI({
      firstParseResult: COMPLEX_FIRST_PARSE_RESULT,
      secondParseResult: differentResult,
    });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    const arbitrationCalls = generate.mock.calls.filter((c) =>
      isArbitrationPrompt((c[0] as AIGenerateOptions).prompt)
    );
    expect(arbitrationCalls).toHaveLength(1);
  });

  it("invalid outcome short-circuits without dual-run", async () => {
    const { ai, generate } = createMockAI({ firstParseOutcome: "invalid" });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("invalid");
    const firstParseCalls = generate.mock.calls.filter((c) =>
      isParserPrompt((c[0] as AIGenerateOptions).prompt)
    );
    expect(firstParseCalls).toHaveLength(1);
  });

  it("returns invalid with a fallback title when AI sends title null", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        outcome: "invalid",
        title: null,
        ledger_entries: [],
        receipt_totals: [],
      },
    });

    const result = await runParsePipeline(
      createInput({ text: "今天天气很好出去散步了" }),
      buildCtx(ai)
    );

    expect(result).toMatchObject({
      kind: "invalid",
      title: expect.any(String),
    });
    if (result.kind === "invalid") {
      expect(result.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns invalid with a fallback title when AI omits title", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        outcome: "invalid",
        receipt_count: 1,
        receipt_totals: [],
        ledger_entries: [],
        order_adjustments: [],
        reasoning: "Not a receipt",
      },
    });

    const result = await runParsePipeline(
      createInput({ text: "今天天气很好出去散步了" }),
      buildCtx(ai)
    );

    expect(result).toMatchObject({
      kind: "invalid",
      title: expect.any(String),
    });
  });

  it("anomaly outcome returns anomaly result", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
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

  it("returns anomaly with a fallback title when AI sends blank title", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        outcome: "anomaly",
        title: "   ",
        anomaly_reason: "Image too blurry",
        ledger_entries: [],
        receipt_totals: [],
      },
    });

    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result).toMatchObject({
      kind: "anomaly",
      anomalyReason: "Image too blurry",
      title: expect.any(String),
    });
  });

  it("text-only input uses text model (no vision call)", async () => {
    const { ai, generate } = createMockAI({ firstParseResult: SIMPLE_FIRST_PARSE_RESULT });
    await runParsePipeline(
      createInput({ evidence: undefined, text: "Lunch 10 USD" }),
      buildCtx(ai)
    );

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
    const { ai } = createMockAI({ firstParseResult: SIMPLE_FIRST_PARSE_RESULT });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0]?.amount).toBe("10");
    }
  });

  it("supports successful reconciliation when aiLanguage is omitted", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        receipt_totals: [{ receipt_index: 0, amount: "12", currency: "USD" }],
        ledger_entries: [{ ...SIMPLE_ENTRY, amount: "10" }],
        order_adjustments: [],
      },
    });

    const result = await runParsePipeline(createInput({ aiLanguage: undefined }), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ amount: "2.00", itemName: expect.any(String) }),
        ])
      );
    }
  });

  it("returns a reconciled synthetic ledger entry when parser output is below the receipt total", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        receipt_totals: [{ receipt_index: 0, amount: "15", currency: "USD" }],
        ledger_entries: [{ ...SIMPLE_ENTRY, amount: "10" }],
        order_adjustments: [],
      },
    });

    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            amount: "5.00",
            itemName: expect.any(String),
            isAdjustment: false,
          }),
        ])
      );
    }
  });

  it("reconciles an over-stated parse by adding a synthetic bill adjustment before mapping to parsed entries", async () => {
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        receipt_totals: [{ receipt_index: 0, amount: "8", currency: "USD" }],
        ledger_entries: [{ ...SIMPLE_ENTRY, amount: "10" }],
        order_adjustments: [],
      },
    });

    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.ledgerEntries[0]).toMatchObject({ amount: "8.00", itemName: "Lunch" });
    }
  });

  it("order_adjustments are folded proportionally into ledgerEntries", async () => {
    // SIMPLE_ENTRY: { receipt_index: 0, amount: "10", currency: "USD", item_name: "Lunch" }
    // receipt total is 8 after a -2 bill-level discount, so reconciliation should not add residuals.
    const { ai } = createMockAI({
      firstParseResult: {
        ...SIMPLE_FIRST_PARSE_RESULT,
        receipt_totals: [{ receipt_index: 0, amount: "8", currency: "USD" }],
        order_adjustments: [
          { receipt_index: 0, item_name: "Discount", amount: "-2", currency: "USD" },
        ],
      },
    });
    const result = await runParsePipeline(createInput(), buildCtx(ai));

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // No separate adjustment row — discount is folded into the entry
      expect(result.ledgerEntries.every((e) => !e.isAdjustment)).toBe(true);
      const entry = result.ledgerEntries.find((e) => e.itemName === "Lunch");
      expect(entry?.amount).toBe("8.00");
    }
  });

  it("cancellation returns cancelled result", async () => {
    const controller = new AbortController();
    // Abort during the first AI call but still return a valid result, so the
    // pipeline reaches the post-parse cancellation check and reports cancelled
    // instead of treating the aborted request as a parse failure.
    const abortingAi: AIContext = {
      generate: async () => {
        controller.abort();
        return { content: JSON.stringify(SIMPLE_FIRST_PARSE_RESULT) };
      },
    };
    const ctx = buildStageContext({
      signal: controller.signal,
      ai: abortingAi,
      docId: "source-doc-1",
      ledgerId: "ledger-1",
    });

    const result = await runParsePipeline(createInput(), ctx);
    expect(result.kind).toBe("cancelled");
  });
});

describe("buildParserInput", () => {
  it("includes categories, text, evidence, aiLanguage, currencies, and custom prompt", () => {
    const input = createInput({
      text: "user text",
      evidence: { images: [{ dataUrl: "data:image/jpeg;base64,FAKE" }] },
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      settings: { aiCustomPrompt: "Prefer food-related detail" },
      categories: [{ id: "cat-1", name: "Food", description: null }],
    });

    const firstParseInput = buildParserInput(input);

    expect(firstParseInput.text).toBe("user text");
    expect(firstParseInput.evidence).toEqual({
      images: [{ dataUrl: "data:image/jpeg;base64,FAKE" }],
    });
    expect(firstParseInput.aiLanguage).toBe("en-US");
    expect(firstParseInput.preferredCurrencies).toEqual(["USD"]);
    expect(firstParseInput.aiCustomPrompt).toBe("Prefer food-related detail");
    expect(firstParseInput.originalCategories).toEqual([{ name: "Food", description: null }]);
  });
});

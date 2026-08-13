import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions } from "@/lib/tasks/types";
import { arbitrateResults } from "@/modules/source-document/application/parse-source-document/arbitration";
import type { NormalizedParseOutput } from "@/modules/source-document/application/parse-source-document/parser-schema";
import type { ParserInput } from "@/modules/source-document/application/parse-source-document/parser";

const makeResult = (overrides: Partial<NormalizedParseOutput> = {}): NormalizedParseOutput => ({
  outcome: "success",
  title: "Test",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: "10", currency: "USD" }],
  ledger_entries: [
    {
      receipt_index: 0,
      item_name: "Item",
      amount: "10",
      currency: "USD",
      category_index: 1,
      notes: null,
    },
  ],
  order_adjustments: [],
  reasoning: "simple",
  ...overrides,
});

const INPUT: ParserInput = {
  originalCategories: [],
  text: "Lunch 10 USD",
};

function arbitrateResultsUnderTest(
  input: Parameters<typeof arbitrateResults>[0],
  ai: Parameters<typeof arbitrateResults>[1]
) {
  return arbitrateResults(input, ai);
}

function getFirstGenerateCall(generate: ReturnType<typeof vi.fn>): AIGenerateOptions {
  const firstCall = generate.mock.calls[0]?.[0];
  if (firstCall == null) {
    throw new Error("Expected AI generate to be called");
  }
  return firstCall as AIGenerateOptions;
}

function createArbitrationAI(choice: number, correctedResult?: object): AIContext {
  let callCount = 0;
  return {
    generate: vi.fn(async (opts: AIGenerateOptions) => {
      callCount++;
      const prompt = opts.prompt ?? "";
      if (prompt.includes("arbitration AI") && callCount === 1) {
        return { content: JSON.stringify({ choice, reason: "result 1 is better" }) };
      }
      // Corrected result request
      if (correctedResult) {
        return { content: JSON.stringify(correctedResult) };
      }
      return { content: JSON.stringify({ choice: 1, reason: "fallback" }) };
    }),
  };
}

describe("arbitrateResults", () => {
  it("returns result1 when choice is 1", async () => {
    const result1 = makeResult({ title: "First" });
    const result2 = makeResult({ title: "Second" });
    const ai = createArbitrationAI(1);

    const outcome = await arbitrateResultsUnderTest({ input: INPUT, result1, result2 }, ai);

    expect(outcome.kind).toBe("chosen");
    if (outcome.kind === "chosen") {
      expect(outcome.result.title).toBe("First");
      expect(outcome.wasArbitrated).toBe(true);
    }
  });

  it("returns result2 when choice is 2", async () => {
    const result1 = makeResult({ title: "First" });
    const result2 = makeResult({ title: "Second" });
    const ai = createArbitrationAI(2);

    const outcome = await arbitrateResultsUnderTest({ input: INPUT, result1, result2 }, ai);

    expect(outcome.kind).toBe("chosen");
    if (outcome.kind === "chosen") {
      expect(outcome.result.title).toBe("Second");
      expect(outcome.wasArbitrated).toBe(true);
    }
  });

  it("requests corrected result when choice is 0 (unclear)", async () => {
    const result1 = makeResult({ title: "First" });
    const result2 = makeResult({ title: "Second" });
    const corrected = {
      outcome: "success",
      title: "Corrected",
      receipt_count: 1,
      receipt_totals: [{ receipt_index: 0, amount: "10", currency: "USD" }],
      ledger_entries: [
        {
          receipt_index: 0,
          item_name: "Item",
          amount: "10",
          currency: "USD",
          category_index: 1,
          notes: null,
        },
      ],
      order_adjustments: [],
      reasoning: "corrected",
    };
    const ai = createArbitrationAI(0, corrected);

    const outcome = await arbitrateResultsUnderTest({ input: INPUT, result1, result2 }, ai);

    expect(outcome.kind).toBe("chosen");
    if (outcome.kind === "chosen") {
      expect(outcome.result.title).toBe("Corrected");
    }
  });

  it("returns anomaly when corrected result has anomaly outcome", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const anomalyCorrected = {
      outcome: "anomaly",
      anomaly_reason: "Cannot resolve conflict",
      title: "",
      receipt_count: 0,
      receipt_totals: [],
      ledger_entries: [],
      order_adjustments: [],
      reasoning: "anomaly",
    };
    const ai = createArbitrationAI(0, anomalyCorrected);

    const outcome = await arbitrateResultsUnderTest({ input: INPUT, result1, result2 }, ai);

    expect(outcome.kind).toBe("anomaly");
    if (outcome.kind === "anomaly") {
      expect(outcome.reason).toBe("Cannot resolve conflict");
    }
  });

  it("uses text model for text-only input", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const generate = vi.fn(async () => ({ content: JSON.stringify({ choice: 1, reason: "ok" }) }));
    const ai: AIContext = { generate };

    await arbitrateResultsUnderTest(
      { input: { originalCategories: [], text: "text only" }, result1, result2 },
      ai
    );

    expect(getFirstGenerateCall(generate).model).toBe("text");
  });

  it("uses vision model when image evidence is present", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const generate = vi.fn(async () => ({ content: JSON.stringify({ choice: 1, reason: "ok" }) }));
    const ai: AIContext = { generate };

    await arbitrateResultsUnderTest(
      {
        input: {
          originalCategories: [],
          evidence: { images: [{ dataUrl: "data:image/png;base64,STORED" }] },
        },
        result1,
        result2,
      },
      ai
    );

    expect(getFirstGenerateCall(generate).model).toBe("vision");
  });

  it("includes input.text in the choice-selection prompt (first call)", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const calls: AIGenerateOptions[] = [];
    const generate = vi.fn(async (opts: AIGenerateOptions) => {
      calls.push(opts);
      return { content: JSON.stringify({ choice: 1, reason: "ok" }) };
    });
    const ai: AIContext = { generate };

    await arbitrateResultsUnderTest(
      {
        input: { originalCategories: [], text: "Receipt: Coffee 5 USD" },
        result1,
        result2,
      },
      ai
    );

    expect(calls[0]?.prompt).toContain("Coffee 5 USD");
  });

  it("includes images in messages for both choice-selection and corrected-result calls", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const calls: AIGenerateOptions[] = [];
    const generate = vi.fn(async (opts: AIGenerateOptions) => {
      calls.push(opts);
      if (calls.length === 1) {
        return { content: JSON.stringify({ choice: 0, reason: "no clear winner" }) };
      }
      return { content: JSON.stringify({ ...makeResult(), outcome: "success" }) };
    });
    const ai: AIContext = { generate };

    await arbitrateResultsUnderTest(
      {
        input: {
          originalCategories: [],
          evidence: { images: [{ dataUrl: "data:image/png;base64,STOREDIMG" }] },
        },
        result1,
        result2,
      },
      ai
    );

    expect(calls).toHaveLength(2);
    // Both calls should carry the image in messages
    const hasImage = (opts: AIGenerateOptions) =>
      opts.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
      );
    expect(hasImage(calls[0]!)).toBe(true);
    expect(hasImage(calls[1]!)).toBe(true);
  });

  it("passes messages array to both ai.generate calls (required field — missing causes map crash)", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const calls: AIGenerateOptions[] = [];
    const generate = vi.fn(async (opts: AIGenerateOptions) => {
      calls.push(opts);
      // First call: choice selection — return choice 0 to force second call
      if (calls.length === 1) {
        return { content: JSON.stringify({ choice: 0, reason: "no clear winner" }) };
      }
      // Second call: corrected result
      return {
        content: JSON.stringify({
          ...makeResult(),
          outcome: "success",
        }),
      };
    });
    const ai: AIContext = { generate };

    await arbitrateResultsUnderTest({ input: INPUT, result1, result2 }, ai);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.messages).toBeDefined();
    expect(Array.isArray(calls[0]?.messages)).toBe(true);
    expect(calls[1]?.messages).toBeDefined();
    expect(Array.isArray(calls[1]?.messages)).toBe(true);
  });

  it("applies locale, currencies, categories, and custom instructions to choice and correction", async () => {
    const result1 = makeResult({ title: "Coffee" });
    const result2 = makeResult({ title: "Cafe" });
    const calls: AIGenerateOptions[] = [];
    const generate = vi.fn(async (opts: AIGenerateOptions) => {
      calls.push(opts);
      if (calls.length === 1) {
        return { content: JSON.stringify({ choice: 0, reason: "wrong locale" }) };
      }
      return { content: JSON.stringify({ ...makeResult(), title: "コーヒー" }) };
    });

    const outcome = await arbitrateResultsUnderTest(
      {
        input: {
          originalCategories: [{ name: "Dining", description: "Meals" }],
          text: "Coffee 10 USD",
          preferredCurrencies: ["JPY", "USD"],
          aiLanguage: "ja-JP",
          aiCustomPrompt: "Write every field in English.",
        },
        result1,
        result2,
      },
      { generate }
    );

    expect(outcome).toMatchObject({ kind: "chosen", result: { title: "コーヒー" } });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.prompt).toContain("Dining");
      expect(call.prompt).toContain("JPY, USD");
      expect(call.prompt).toContain("Write every field in English.");
      expect(call.prompt).toContain("日本語 (ja-JP)");
      expect(call.prompt?.indexOf("Mandatory Output Locale")).toBeGreaterThan(
        call.prompt?.indexOf("Write every field in English.") ?? -1
      );
    }
  });

  it("applies the shared title policy to choice and correction prompts", async () => {
    const result1 = makeResult({ title: "Coffee" });
    const result2 = makeResult({ title: "Cafe" });
    const calls: AIGenerateOptions[] = [];
    const generate = vi.fn(async (opts: AIGenerateOptions) => {
      calls.push(opts);
      if (calls.length === 1) {
        return { content: JSON.stringify({ choice: 0, reason: "no clear winner" }) };
      }
      return { content: JSON.stringify({ ...makeResult(), title: "コーヒー" }) };
    });

    await arbitrateResultsUnderTest(
      {
        input: {
          originalCategories: [],
          text: "Coffee 10 USD",
          aiLanguage: "ja-JP",
          aiCustomPrompt: "Use concise merchant-first titles.",
        },
        result1,
        result2,
      },
      { generate }
    );

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.prompt).toContain("### Title Policy");
      expect(call.prompt).toContain("merchant- or service-first");
      expect(call.prompt).toContain("at most 200 Unicode characters");
      expect(call.prompt).toContain("Use concise merchant-first titles.");
    }
  });
});

import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions } from "@/lib/tasks/types";
import { arbitrateResults } from "@/modules/source-document/application/parse-source-document/arbitration";
import type { NormalizedParseOutput as NormalizedStage0ParseOutput } from "@/modules/source-document/application/parse-source-document/parser-schema";
import type { ParserInput as Stage0Input } from "@/modules/source-document/application/parse-source-document/parser";

vi.mock("@/lib/storage/utils", () => ({
  isSuccessfulLoadImageResult: (result: { success: boolean }) => result.success,
  loadImagesForAI: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({ url, dataUrl: `data:image/png;base64,STOREDIMG`, success: true }))
  ),
  loadStoredFilesForAI: vi.fn(async (_ledgerId: string, ids: string[]) =>
    ids.map((id) => ({ url: id, dataUrl: `data:image/png;base64,STOREDIMG`, success: true }))
  ),
}));

const makeResult = (
  overrides: Partial<NormalizedStage0ParseOutput> = {}
): NormalizedStage0ParseOutput => ({
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

const INPUT: Stage0Input = {
  originalCategories: [],
  text: "Lunch 10 USD",
};

function arbitrateStage0Results(
  input: Parameters<typeof arbitrateResults>[0],
  ai: Parameters<typeof arbitrateResults>[1]
) {
  return arbitrateResults({ ...input, input: { ledgerId: "ledger-1", ...input.input } }, ai);
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

describe("arbitrateStage0Results", () => {
  it("returns result1 when choice is 1", async () => {
    const result1 = makeResult({ title: "First" });
    const result2 = makeResult({ title: "Second" });
    const ai = createArbitrationAI(1);

    const outcome = await arbitrateStage0Results({ input: INPUT, result1, result2 }, ai);

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

    const outcome = await arbitrateStage0Results({ input: INPUT, result1, result2 }, ai);

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

    const outcome = await arbitrateStage0Results({ input: INPUT, result1, result2 }, ai);

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

    const outcome = await arbitrateStage0Results({ input: INPUT, result1, result2 }, ai);

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

    await arbitrateStage0Results(
      { input: { originalCategories: [], text: "text only" }, result1, result2 },
      ai
    );

    expect(getFirstGenerateCall(generate).model).toBe("text");
  });

  it("uses vision model when storedFileIds are present", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const generate = vi.fn(async () => ({ content: JSON.stringify({ choice: 1, reason: "ok" }) }));
    const ai: AIContext = { generate };

    await arbitrateStage0Results(
      {
        input: { originalCategories: [], storedFileIds: ["data:image/png;base64,STORED"] },
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

    await arbitrateStage0Results(
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

    await arbitrateStage0Results(
      {
        input: { originalCategories: [], storedFileIds: ["https://example.com/receipt.jpg"] },
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

    await arbitrateStage0Results({ input: INPUT, result1, result2 }, ai);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.messages).toBeDefined();
    expect(Array.isArray(calls[0]?.messages)).toBe(true);
    expect(calls[1]?.messages).toBeDefined();
    expect(Array.isArray(calls[1]?.messages)).toBe(true);
  });
});

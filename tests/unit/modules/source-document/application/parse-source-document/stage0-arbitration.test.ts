import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions } from "@/lib/flow";
import { arbitrateStage0Results } from "@/modules/source-document/application/parse-source-document/stage0-arbitration";
import type { NormalizedStage0ParseOutput } from "@/modules/source-document/application/parse-source-document/stage0-schema";
import type { Stage0Input } from "@/modules/source-document/application/parse-source-document/stage0-vision";

const makeResult = (overrides: Partial<NormalizedStage0ParseOutput> = {}): NormalizedStage0ParseOutput => ({
  outcome: "success",
  title: "Test",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: 10, currency: "USD" }],
  ledger_entries: [
    { receipt_index: 0, item_name: "Item", amount: 10, currency: "USD", category_index: 1, notes: null },
  ],
  order_adjustments: [],
  reasoning: "simple",
  ...overrides,
});

const INPUT: Stage0Input = {
  originalCategories: [],
  text: "Lunch 10 USD",
};

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
      receipt_totals: [{ receipt_index: 0, amount: 10, currency: "USD" }],
      ledger_entries: [
        { receipt_index: 0, item_name: "Item", amount: 10, currency: "USD", category_index: 1, notes: null },
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

    await arbitrateStage0Results({ input: { originalCategories: [], text: "text only" }, result1, result2 }, ai);

    const firstCall = generate.mock.calls[0] as [AIGenerateOptions];
    expect(firstCall[0].model).toBe("text");
  });

  it("uses vision model when imageUrls are present", async () => {
    const result1 = makeResult();
    const result2 = makeResult();
    const generate = vi.fn(async () => ({ content: JSON.stringify({ choice: 1, reason: "ok" }) }));
    const ai: AIContext = { generate };

    await arbitrateStage0Results({
      input: { originalCategories: [], imageUrls: ["data:image/jpeg;base64,FAKE"] },
      result1,
      result2,
    }, ai);

    const firstCall = generate.mock.calls[0] as [AIGenerateOptions];
    expect(firstCall[0].model).toBe("vision");
  });
});

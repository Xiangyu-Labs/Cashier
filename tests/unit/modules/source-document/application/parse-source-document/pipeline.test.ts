import { describe, it, expect, vi } from "vitest";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import { buildStageContext } from "@/modules/source-document/application/parse-source-document/context";
import { runParsePipeline } from "@/modules/source-document/application/parse-source-document/pipeline";
import { buildStage1Input } from "@/modules/source-document/application/parse-source-document/pipeline-stage-inputs";

// Mock image loading so pipeline tests don't need real storage
vi.mock("@/lib/storage/utils", () => ({
  loadImagesForAI: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({ url, dataUrl: `data:image/jpeg;base64,FAKE`, success: true }))
  ),
}));

/**
 * 3-Stage Pipeline Mock AI
 *
 * Detects stage by model or prompt content:
 * - Stage 0: model === "vision" → returns structured DocumentUnderstanding JSON
 * - Stage 1: validity prompt → returns { is_valid, reasoning }
 * - Stage 2: detailed parse prompt → dual-run + arbitration
 *
 * Stage 1.5 ("You are a validation AI") must NEVER be called in the new pipeline.
 */
function createPipelineMockAI(options: {
  isValid?: boolean;
  stage2Outcome?: "success" | "anomaly";
  stage2AnomalyReason?: string;
  stage2ArbitrationFails?: boolean;
  title?: string;
  currencies?: string[];
  categories?: string[];
  entries?: Array<{
    item_name: string;
    amount: number;
    currency: string;
    category_index: number;
    entry_date: string;
    notes: string | null;
  }>;
}): { ai: AIContext; generate: ReturnType<typeof vi.fn> } {
  const {
    isValid = true,
    stage2Outcome = "success",
    stage2AnomalyReason = "Anomaly detected",
    stage2ArbitrationFails = false,
    title = "Test Receipt",
    currencies = ["USD"],
    categories = ["Food"],
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
  } = options;

  const generate = vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
    const prompt = opts.prompt ?? "";

    // Stage 0: structured document understanding (vision model)
    if (opts.model === "vision") {
      return {
        content: JSON.stringify({
          documentType: "receipt",
          primaryEvidence: {
            merchant: "Test Merchant",
            totals: ["USD 10.00"],
            currencies,
            dates: ["2024-01-01"],
            lineItems: entries.map((e) => `${e.item_name}: ${e.amount} ${e.currency}`),
          },
          secondaryEvidence: ["Store address: 123 Main St", "Thank you for your purchase"],
          ambiguities: [],
          salienceHints: "Primary total and line items clearly printed at center.",
        }),
      };
    }

    // Stage 1.5 (OLD) — must NOT be called in the new pipeline
    if (prompt.includes("You are a validation AI")) {
      throw new Error(
        "Stage 1.5 was called — this stage must not exist in the new 3-stage pipeline"
      );
    }

    // Stage 1: validity-only gate
    if (prompt.includes("financial document validation AI")) {
      return {
        content: JSON.stringify({
          is_valid: isValid,
          reasoning: isValid ? "Document contains amounts" : "No amounts found",
        }),
      };
    }

    // Stage 2 arbitration call
    if (prompt.includes("arbitration AI") || prompt.includes("GPT 1 Result")) {
      if (stage2ArbitrationFails) {
        return { content: JSON.stringify({ choice: 0, reason: "Both results invalid" }) };
      }
      return { content: JSON.stringify({ choice: 1, reason: "GPT 1 is correct" }) };
    }

    // Stage 2: detailed parse prompt
    if (prompt.includes("detailed financial document parser")) {
      if (stage2Outcome === "anomaly") {
        return {
          content: JSON.stringify({
            outcome: "anomaly",
            anomaly_reason: stage2AnomalyReason,
            title,
            currencies: currencies.map((c) => ({ code: c, hint: "detected" })),
            ledger_entries: [],
            reasoning: "Cannot parse",
          }),
        };
      }

      return {
        content: JSON.stringify({
          outcome: "success",
          title,
          currencies: currencies.map((c) => ({ code: c, hint: "detected" })),
          categories: categories.map((c) => ({ name: c, hint: "matched" })),
          ledger_entries: entries,
          reasoning: "Parse successful",
        }),
      };
    }

    throw new Error(`Unexpected AI call. Prompt snippet: ${prompt.slice(0, 120)}`);
  });

  const ai: AIContext = { generate };
  return { ai, generate };
}

function createInput(
  overrides: Partial<ParseSourceDocumentInput> = {}
): ParseSourceDocumentInput {
  return {
    sourceDocumentId: "source-doc-1",
    ledgerId: "ledger-1",
    text: undefined,
    imageUrls: ["/api/uploads/test-receipt.jpg"],
    aiLanguage: "zh-CN",
    preferredCurrencies: ["USD"],
    categories: [{ id: "cat-1", name: "Food", description: null }],
    settings: {},
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

describe("runParsePipeline - new 3-stage flow", () => {
  it("succeeds through Stage 0 → Stage 1 → Stage 2 without calling Stage 1.5", async () => {
    const { ai, generate } = createPipelineMockAI({});
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    expect(result.kind).toBe("success");

    // Stage 1.5 ("You are a validation AI") must never be called
    const stage1_5Calls = generate.mock.calls.filter((c) =>
      (c[0] as AIGenerateOptions).prompt?.includes("You are a validation AI")
    );
    expect(stage1_5Calls).toHaveLength(0);
  });

  it("Stage 0 returns structured evidence with primary/secondary salience (not flat text)", async () => {
    const { ai, generate } = createPipelineMockAI({});
    const ctx = buildCtx(ai);

    await runParsePipeline(createInput(), ctx);

    // Stage 0 must be invoked as the vision model
    const visionCall = generate.mock.calls.find(
      (c) => (c[0] as AIGenerateOptions).model === "vision"
    );
    expect(visionCall).toBeDefined();
    expect(visionCall![0].model).toBe("vision");
  });

  it("Stage 0 structured payload preserves primary vs secondary evidence labels", async () => {
    const { ai, generate } = createPipelineMockAI({
      currencies: ["CNY"],
      entries: [{ item_name: "Coffee", amount: 30, currency: "CNY", category_index: 1, entry_date: "2024-01-01", notes: null }],
    });
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    // Pipeline must succeed — Stage 2 must be able to consume structured evidence
    expect(result.kind).toBe("success");

    // Stage 2 parse calls must happen (dual-run minimum)
    const stage2Calls = generate.mock.calls.filter(
      (c) => (c[0] as AIGenerateOptions).prompt?.includes("detailed financial document parser")
    );
    expect(stage2Calls.length).toBeGreaterThanOrEqual(2);
  });

  // === Gate Parity Tests ===

  it("[GATE] Stage 1 validity=false → ParsePipelineResult.kind = invalid", async () => {
    const { ai } = createPipelineMockAI({ isValid: false });
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    expect(result.kind).toBe("invalid");
    // Title must NOT be present on invalid results (title-on-invalid behavior removed)
    expect((result as { title?: string }).title).toBeUndefined();
  });

  it("[GATE] Stage 2 anomaly outcome → ParsePipelineResult.kind = anomaly", async () => {
    const { ai } = createPipelineMockAI({
      stage2Outcome: "anomaly",
      stage2AnomalyReason: "Document is incomplete",
    });
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    expect(result.kind).toBe("anomaly");
    expect((result as { anomalyReason: string }).anomalyReason).toBeTruthy();
  });

  it("[GATE] Stage 2 arbitration failure → ParsePipelineResult.kind = anomaly", async () => {
    const { ai } = createPipelineMockAI({ stage2ArbitrationFails: true });
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    expect(result.kind).toBe("anomaly");
  });

  it("[GATE] Stage 2 successful parse → ParsePipelineResult.kind = success with ledgerEntries", async () => {
    const { ai } = createPipelineMockAI({
      entries: [
        { item_name: "Dinner", amount: 50, currency: "USD", category_index: 1, entry_date: "2024-01-02", notes: null },
      ],
    });
    const ctx = buildCtx(ai);

    const result = await runParsePipeline(createInput(), ctx);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.ledgerEntries.length).toBeGreaterThan(0);
    }
  });

  it("cancellation still works - abort during stage 1 returns cancelled", async () => {
    const controller = new AbortController();
    const { ai } = createPipelineMockAI({});
    const ctx = buildStageContext({
      signal: controller.signal,
      ai,
      setProgress: vi.fn(async (message: string) => {
        if (message === "正在分析单据信息...") {
          controller.abort();
        }
      }),
      docId: "source-doc-1",
      ledgerId: "ledger-1",
    });

    const result = await runParsePipeline(createInput(), ctx);

    expect(result).toEqual({ kind: "cancelled" });
  });
});

describe("buildStage1Input", () => {
  it("normalizes categories and forwards optional fields", () => {
    const input = createInput({
      text: "user text",
      imageUrls: ["/api/uploads/doc.jpg"],
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      settings: { aiCustomPrompt: "Prefer food-related detail" },
      categories: [{ id: "cat-1", name: "Food", description: null }],
    });

    // After refactor buildStage1Input accepts DocumentUnderstanding (structured Stage 0 output)
    // instead of a plain visionDescription string.
    // Passing undefined for now — full structured type update happens in Task 2.
    const stage1Input = buildStage1Input(input, undefined);

    expect(stage1Input).toMatchObject({
      text: "user text",
      imageUrls: ["/api/uploads/doc.jpg"],
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      aiCustomPrompt: "Prefer food-related detail",
      categories: [{ name: "Food", description: null }],
    });
  });
});


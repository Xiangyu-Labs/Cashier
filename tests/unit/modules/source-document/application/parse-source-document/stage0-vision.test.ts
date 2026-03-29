import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeParser as executeStage0 } from "@/modules/source-document/application/parse-source-document/parser";
import type { AIContext, AIGenerateOptions } from "@/lib/flow/types";

// Mock image loading so tests don't need real storage
vi.mock("@/lib/storage/utils", () => ({
  isSuccessfulLoadImageResult: (result: { success: boolean }) => result.success,
  loadImagesForAI: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({ url, dataUrl: `data:image/jpeg;base64,FAKE`, success: true }))
  ),
}));

const SIMPLE_SUCCESS_RESPONSE = {
  outcome: "success",
  title: "Test Restaurant",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: 45.0, currency: "CNY" }],
  ledger_entries: [
    {
      receipt_index: 0,
      item_name: "Lunch set",
      amount: 45.0,
      currency: "CNY",
      category_index: 1,
      notes: null,
    },
  ],
  order_adjustments: [],
  reasoning: "Single item receipt",
};

function createMockAI(response: unknown = SIMPLE_SUCCESS_RESPONSE): AIContext {
  return {
    generate: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
    }),
  };
}

function getFirstGenerateCall(generate: ReturnType<typeof vi.fn>): AIGenerateOptions {
  const firstCall = generate.mock.calls[0]?.[0];
  if (firstCall == null) {
    throw new Error("Expected AI generate to be called");
  }
  return firstCall as AIGenerateOptions;
}

describe("executeStage0 — single-pass receipt parser", () => {
  let mockAI: AIContext;

  beforeEach(() => {
    mockAI = createMockAI();
  });

  // === Return shape ===

  it("returns NormalizedStage0ParseOutput with outcome, title, entries, adjustments", async () => {
    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      mockAI
    );

    expect(result.outcome).toBe("success");
    expect(result.title).toBe("Test Restaurant");
    expect(result.receipt_count).toBe(1);
    expect(result.receipt_totals).toHaveLength(1);
    expect(result.ledger_entries).toHaveLength(1);
    expect(result.order_adjustments).toEqual([]);
  });

  it("does NOT return DocumentUnderstanding shape (no primaryEvidence field)", async () => {
    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      mockAI
    );

    expect("primaryEvidence" in result).toBe(false);
    expect("documentType" in result).toBe(false);
  });

  it("preserves receipt_index on ledger entries", async () => {
    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      mockAI
    );

    expect(result.ledger_entries[0]?.receipt_index).toBe(0);
  });

  it("preserves order_adjustments with negative amounts", async () => {
    const aiWithAdjustment = createMockAI({
      ...SIMPLE_SUCCESS_RESPONSE,
      order_adjustments: [
        { receipt_index: 0, item_name: "Discount", amount: -5.0, currency: "CNY" },
      ],
    });

    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      aiWithAdjustment
    );

    expect(result.order_adjustments).toHaveLength(1);
    expect(result.order_adjustments[0]?.amount).toBe(-5.0);
  });

  // === Model selection ===

  it("uses vision model when imageUrls are provided", async () => {
    await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      mockAI
    );

    expect(getFirstGenerateCall(mockAI.generate as ReturnType<typeof vi.fn>).model).toBe("vision");
  });

  it("passes user content through messages instead of legacy images field", async () => {
    const generate = vi.fn(async (options: AIGenerateOptions) => {
      const firstMessage = options.messages[0];
      expect(firstMessage).toBeDefined();
      expect(firstMessage?.role).toBe("user");
      expect(Array.isArray(firstMessage?.content)).toBe(true);

      const content = firstMessage?.content;
      if (!Array.isArray(content)) {
        throw new Error("Expected multimodal user content array");
      }

      expect(content[0]).toEqual({ type: "text", text: "Please parse this source document." });
      expect(content[1]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,FAKE" },
      });

      return {
        content: JSON.stringify(SIMPLE_SUCCESS_RESPONSE),
      };
    });

    await executeStage0(
      { imageUrls: ["/api/uploads/ledger/doc/image.webp"], originalCategories: [] },
      { generate }
    );

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("uses text model when only text is provided", async () => {
    await executeStage0(
      { text: "Taxi fare SGD 28.00", originalCategories: [] },
      mockAI
    );

    expect(getFirstGenerateCall(mockAI.generate as ReturnType<typeof vi.fn>).model).toBe("text");
  });

  it("uses vision model for mixed text+image input", async () => {
    await executeStage0(
      { text: "meal", imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      mockAI
    );

    expect(getFirstGenerateCall(mockAI.generate as ReturnType<typeof vi.fn>).model).toBe("vision");
  });

  // === Outcome branches ===

  it("returns invalid outcome when AI reports invalid", async () => {
    const aiInvalid = createMockAI({
      ...SIMPLE_SUCCESS_RESPONSE,
      outcome: "invalid",
      ledger_entries: [],
      receipt_totals: [],
    });

    const result = await executeStage0(
      { text: "random text", originalCategories: [] },
      aiInvalid
    );

    expect(result.outcome).toBe("invalid");
  });

  it("returns anomaly outcome when AI reports anomaly", async () => {
    const aiAnomaly = createMockAI({
      ...SIMPLE_SUCCESS_RESPONSE,
      outcome: "anomaly",
      anomaly_reason: "Blurry image",
      ledger_entries: [],
      receipt_totals: [],
    });

    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc"], originalCategories: [] },
      aiAnomaly
    );

    expect(result.outcome).toBe("anomaly");
    expect(result.anomaly_reason).toBe("Blurry image");
  });

  // === Prompt contains required sections ===

  it("injects category list into prompt when categories are provided", async () => {
    await executeStage0(
      {
        text: "coffee 10 USD",
        originalCategories: [{ name: "Food", description: "Meals and snacks" }],
      },
      mockAI
    );

    expect(getFirstGenerateCall(mockAI.generate as ReturnType<typeof vi.fn>).prompt).toContain("Food");
  });

  it("prompt contains receipt and invoice parser identifier", async () => {
    await executeStage0(
      { text: "coffee 10 USD", originalCategories: [] },
      mockAI
    );

    expect(getFirstGenerateCall(mockAI.generate as ReturnType<typeof vi.fn>).prompt).toContain(
      "receipt and invoice parser"
    );
  });

  // === Multi-image ===

  it("handles multiple images without error", async () => {
    const result = await executeStage0(
      {
        imageUrls: ["data:image/jpeg;base64,abc", "data:image/jpeg;base64,def"],
        originalCategories: [],
      },
      mockAI
    );
    expect(result.outcome).toBe("success");
  });
});

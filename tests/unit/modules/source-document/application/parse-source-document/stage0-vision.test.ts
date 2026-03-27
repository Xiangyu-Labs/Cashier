import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStage0 } from "@/modules/source-document/application/parse-source-document/stage0-vision";
import type { AIContext, AIGenerateOptions } from "@/lib/flow/types";

// Mock image loading so tests don't need real storage
vi.mock("@/lib/storage/utils", () => ({
  loadImagesForAI: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({ url, dataUrl: `data:image/jpeg;base64,FAKE`, success: true }))
  ),
}));

const STRUCTURED_RESPONSE = {
  documentType: "receipt",
  primaryEvidence: {
    merchant: "Test Restaurant",
    totals: ["¥45.00"],
    currencies: ["CNY"],
    dates: ["2024-01-15"],
    lineItems: ["Lunch set: ¥45.00"],
  },
  secondaryEvidence: ["Store address: 123 Main St", "Thank you for your purchase"],
  ambiguities: [],
  salienceHints: "Total amount and merchant name are clearly printed at center.",
};

function createMockAI(response: unknown = STRUCTURED_RESPONSE): AIContext {
  return {
    generate: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
    }),
  };
}

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("executeStage0 — structured document understanding", () => {
  let mockAI: AIContext;

  beforeEach(() => {
    mockAI = createMockAI();
  });

  // === Return shape ===

  it("returns structured DocumentUnderstanding, not a flat description string", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    // Must NOT have a flat description field
    expect((result as { description?: string }).description).toBeUndefined();

    // Must have structured fields
    expect(result).toHaveProperty("documentType");
    expect(result).toHaveProperty("primaryEvidence");
    expect(result).toHaveProperty("secondaryEvidence");
    expect(result).toHaveProperty("ambiguities");
    expect(result).toHaveProperty("salienceHints");
  });

  it("primaryEvidence contains merchant, totals, currencies, dates, lineItems", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const primary = (result as unknown as { primaryEvidence: Record<string, unknown> }).primaryEvidence;
    expect(primary).toHaveProperty("merchant");
    expect(primary).toHaveProperty("totals");
    expect(primary).toHaveProperty("currencies");
    expect(primary).toHaveProperty("dates");
    expect(primary).toHaveProperty("lineItems");
  });

  it("preserves primary vs secondary evidence as separate arrays", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const r = result as {
      primaryEvidence: { lineItems: string[] };
      secondaryEvidence: string[];
    };
    expect(Array.isArray(r.primaryEvidence.lineItems)).toBe(true);
    expect(Array.isArray(r.secondaryEvidence)).toBe(true);
  });

  it("returns parsed values from AI response correctly", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const r = result as typeof STRUCTURED_RESPONSE;
    expect(r.documentType).toBe("receipt");
    expect(r.primaryEvidence.merchant).toBe("Test Restaurant");
    expect(r.primaryEvidence.currencies).toContain("CNY");
    expect(r.primaryEvidence.totals).toContain("¥45.00");
    expect(r.secondaryEvidence).toContain("Store address: 123 Main St");
    expect(r.salienceHints).toBeTruthy();
  });

  it("returns empty arrays for ambiguities when document is clear", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const r = result as { ambiguities: string[] };
    expect(Array.isArray(r.ambiguities)).toBe(true);
  });

  // === AI call contract ===

  it("calls vision model with requireJson: true", async () => {
    await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const call = requireDefined(
      (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AIGenerateOptions | undefined,
      "Expected generate call"
    );
    expect(call.model).toBe("vision");
    expect(call.requireJson).toBe(true);
  });

  it("does not call AI when no images provided", async () => {
    await executeStage0({ imageUrls: [] }, mockAI);
    expect(mockAI.generate).not.toHaveBeenCalled();
  });

  it("returns null-safe empty DocumentUnderstanding when no images provided", async () => {
    const result = await executeStage0({ imageUrls: [] }, mockAI);

    // When no images: must still return structured shape, not { description: "" }
    expect((result as { description?: string }).description).toBeUndefined();
    // documentType should be present (possibly null/empty)
    expect("documentType" in result).toBe(true);
  });

  // === Salience preservation ===

  it("salienceHints is a non-empty string describing spatial/visual salience", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const r = result as { salienceHints: string };
    expect(typeof r.salienceHints).toBe("string");
    expect(r.salienceHints.length).toBeGreaterThan(0);
  });

  it("secondary evidence is distinct from primary line items (not flattened together)", async () => {
    const customResponse = {
      ...STRUCTURED_RESPONSE,
      primaryEvidence: {
        ...STRUCTURED_RESPONSE.primaryEvidence,
        lineItems: ["Steak: $50.00"],
      },
      secondaryEvidence: ["Promotional offer: 10% off next visit"],
    };
    const ai = createMockAI(customResponse);
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, ai);

    const r = result as typeof customResponse;
    // Primary line items must not include promotional text
    expect(r.primaryEvidence.lineItems).not.toContain("Promotional offer: 10% off next visit");
    // Secondary evidence must contain it
    expect(r.secondaryEvidence).toContain("Promotional offer: 10% off next visit");
  });

  // === Multi-image ===

  it("handles multiple images without error", async () => {
    const result = await executeStage0(
      { imageUrls: ["data:image/jpeg;base64,abc", "data:image/jpeg;base64,def"] },
      mockAI
    );
    expect(result).toHaveProperty("documentType");
  });
});

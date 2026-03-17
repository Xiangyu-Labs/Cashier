import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStage0 } from "@/features/source-document/server/tasks/stage0-vision";
import type { AIContext } from "@/lib/flow/types";

function createMockAI(responseText: string): AIContext {
  return {
    generate: vi.fn().mockResolvedValue({
      content: responseText,
      usage: { promptTokens: 500, completionTokens: 200 },
    }),
  };
}

describe("executeStage0", () => {
  let mockAI: AIContext;

  beforeEach(() => {
    mockAI = createMockAI("Receipt from Test Restaurant. Total: ¥45.00. Items: Lunch set ¥45.00.");
  });

  it("returns empty description when no images provided", async () => {
    const result = await executeStage0({ imageUrls: [] }, mockAI);
    expect(result.description).toBe("");
    expect(mockAI.generate).not.toHaveBeenCalled();
  });

  it("calls vision tier with image content", async () => {
    await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    expect(mockAI.generate).toHaveBeenCalledOnce();
    const call = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe("vision");
  });

  it("does not require JSON output", async () => {
    await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const call = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.requireJson).toBeFalsy();
  });

  it("returns the AI response as description", async () => {
    const result = await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);
    expect(result.description).toBe(
      "Receipt from Test Restaurant. Total: ¥45.00. Items: Lunch set ¥45.00."
    );
  });

  it("sends image as image_url content part", async () => {
    await executeStage0({ imageUrls: ["data:image/jpeg;base64,abc"] }, mockAI);

    const call = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = call.messages;
    const content = messages[0].content;
    const imagePart = content.find((p: { type: string }) => p.type === "image_url");
    expect(imagePart).toBeDefined();
    expect(imagePart.image_url.url).toBe("data:image/jpeg;base64,abc");
  });

  it("includes focus hints in prompt when provided", async () => {
    await executeStage0(
      {
        imageUrls: ["data:image/jpeg;base64,abc"],
        focusHints: ["pay attention to tax amounts"],
      },
      mockAI
    );

    const call = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain("pay attention to tax amounts");
  });

  it("adds multi-image preamble when multiple images provided", async () => {
    await executeStage0(
      {
        imageUrls: ["data:image/jpeg;base64,abc", "data:image/jpeg;base64,def"],
      },
      mockAI
    );

    const call = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = call.messages;
    const content = messages[0].content;
    const textPart = content.find((p: { type: string }) => p.type === "text");
    expect(textPart?.text).toContain("2 images");
  });
});

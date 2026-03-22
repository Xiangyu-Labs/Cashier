import { describe, it, expect } from "vitest";
import { buildMessageContent } from "@/modules/source-document/application/parse-source-document/message-content";

describe("buildMessageContent", () => {
  it("returns labeled text when only text provided", () => {
    const result = buildMessageContent("hello");
    expect(result).toEqual([{ type: "text", text: "用户直接提供的描述：\nhello" }]);
  });

  it("returns image parts when only imageUrls provided (fallback when no vision model)", () => {
    const result = buildMessageContent(undefined, ["data:image/jpeg;base64,abc"]);
    expect(result).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc" } },
    ]);
  });

  it("returns labeled AI vision description when visionDescription provided", () => {
    const result = buildMessageContent(
      undefined,
      ["data:image/jpeg;base64,abc"],
      "A receipt for ¥45"
    );
    expect(result).toEqual([{ type: "text", text: "AI从图片识别的内容：\nA receipt for ¥45" }]);
  });

  it("visionDescription takes precedence over imageUrls", () => {
    const result = buildMessageContent(undefined, ["data:image/jpeg;base64,abc"], "A receipt");
    const types = result.map((p) => p.type);
    expect(types).not.toContain("image_url");
    expect(types).toContain("text");
  });

  it("combines both user text and visionDescription into single labeled text", () => {
    const result = buildMessageContent("user note", undefined, "A receipt for ¥45");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "text",
      text: "用户直接提供的描述：\nuser note\n\nAI从图片识别的内容：\nA receipt for ¥45",
    });
  });

  it("includes both text and imageUrls when no visionDescription", () => {
    const result = buildMessageContent("user note", ["data:image/jpeg;base64,abc"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text", text: "用户直接提供的描述：\nuser note" });
    expect(result[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,abc" },
    });
  });

  it("returns fallback when no input provided", () => {
    const result = buildMessageContent();
    expect(result).toEqual([{ type: "text", text: "[No input provided]" }]);
  });

  it("handles multiple imageUrls (fallback)", () => {
    const result = buildMessageContent(undefined, ["url1", "url2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "image_url", image_url: { url: "url1" } });
    expect(result[1]).toEqual({ type: "image_url", image_url: { url: "url2" } });
  });

  it("handles empty or whitespace-only text as no text", () => {
    const result = buildMessageContent("   ", undefined, "vision desc");
    expect(result).toEqual([{ type: "text", text: "AI从图片识别的内容：\nvision desc" }]);
  });

  it("handles empty or whitespace-only visionDescription as no vision", () => {
    const result = buildMessageContent("user text", undefined, "   ");
    expect(result).toEqual([{ type: "text", text: "用户直接提供的描述：\nuser text" }]);
  });
});

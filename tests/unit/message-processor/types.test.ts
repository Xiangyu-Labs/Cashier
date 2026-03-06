import { describe, it, expect } from "vitest";
import { determineSourceType, SourceDocumentInput } from "@/features/ai/types";

describe("determineSourceType", () => {
  it('should return "text" for text-only input', () => {
    const input: SourceDocumentInput = { text: "Hello" };
    expect(determineSourceType(input)).toBe("text");
  });

  it('should return "image" for image-only input', () => {
    const input: SourceDocumentInput = {
      images: [{ data: "base64...", mimeType: "image/jpeg" }],
    };
    expect(determineSourceType(input)).toBe("image");
  });

  it('should return "mixed" for text + image input', () => {
    const input: SourceDocumentInput = {
      text: "Description",
      images: [{ data: "base64...", mimeType: "image/jpeg" }],
    };
    expect(determineSourceType(input)).toBe("mixed");
  });

  it('should return "text" for empty input', () => {
    const input: SourceDocumentInput = {};
    expect(determineSourceType(input)).toBe("text");
  });

  it('should return "text" for empty images array', () => {
    const input: SourceDocumentInput = { images: [] };
    expect(determineSourceType(input)).toBe("text");
  });

  it('should return "text" for undefined text', () => {
    const input: SourceDocumentInput = { text: undefined };
    expect(determineSourceType(input)).toBe("text");
  });

  it('should return "image" for multiple images', () => {
    const input: SourceDocumentInput = {
      images: [
        { data: "base64_1...", mimeType: "image/jpeg" },
        { data: "base64_2...", mimeType: "image/png" },
      ],
    };
    expect(determineSourceType(input)).toBe("image");
  });
});
